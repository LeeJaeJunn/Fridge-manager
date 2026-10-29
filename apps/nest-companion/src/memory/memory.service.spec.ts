import type {
  CreateMemoryRequestType,
  MemoryCategoryType,
  UpdateMemoryRequestType,
} from '@companion/types';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TAG_GROUPS } from '../character/persona';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { MEMORY_CATEGORIES, MEMORY_LIMITS } from './memory.options';
import { MemoryService } from './memory.service';

type QueryMock = jest.Mock<Promise<unknown>, [unknown]>;
type StoredMemory = {
  id: string;
  userId: string;
  category: MemoryCategoryType;
  content: string;
  createdAt: Date;
};
type QueryArgs = {
  where: { id?: string; userId: string };
};
type WriteArgs = {
  where?: QueryArgs['where'];
  data: { userId?: string; category?: MemoryCategoryType; content?: string };
};
const NOW = new Date('2026-10-30T00:00:00.000Z');

describe('MemoryService manual editing', () => {
  let rows: StoredMemory[];
  let memory: { findMany: QueryMock; findFirst: QueryMock; create: QueryMock; update: QueryMock };
  let service: MemoryService;

  beforeEach(() => {
    rows = [
      { id: 'm1', userId: 'u1', category: 'PREFERENCE', content: '땅콩', createdAt: NOW },
      { id: 'm2', userId: 'u2', category: 'ALLERGY', content: '오이', createdAt: NOW },
    ];
    memory = {
      findMany: jest.fn().mockImplementation((arg: unknown) => {
        const { where } = arg as QueryArgs;
        return Promise.resolve(rows.filter((row) => row.userId === where.userId));
      }),
      findFirst: jest.fn().mockImplementation((arg: unknown) => {
        const { where } = arg as QueryArgs;
        return Promise.resolve(
          rows.find((row) => row.id === where.id && row.userId === where.userId) ?? null,
        );
      }),
      create: jest.fn().mockImplementation((arg: unknown) => {
        const { data } = arg as {
          data: Pick<StoredMemory, 'userId' | 'category' | 'content'>;
        };
        const row: StoredMemory = {
          id: `created-${rows.length}`,
          userId: data.userId,
          category: data.category,
          content: data.content,
          createdAt: NOW,
        };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn().mockImplementation((arg: unknown) => {
        const { where, data } = arg as WriteArgs;
        if (!where) throw new Error('An update requires an owner-scoped id');
        const row = rows.find((entry) => entry.id === where.id && entry.userId === where.userId);
        if (!row) throw new Error('Cannot update an unowned memory');
        if (typeof data.category !== 'undefined') row.category = data.category;
        if (typeof data.content !== 'undefined') row.content = data.content;
        return Promise.resolve(row);
      }),
    };
    service = new MemoryService(
      { memory } as unknown as PrismaService,
      {} as LlmService,
      { get: () => undefined, getOrThrow: () => 'test-model' } as unknown as ConfigService,
    );
  });

  it('creates a whitespace-cleaned memory that list and recall immediately expose', async () => {
    const result = await service.create('u1', {
      category: 'PREFERENCE',
      content: '  매운 음식   좋아함 ',
    });

    expect(result).toEqual({
      id: 'created-2',
      category: 'PREFERENCE',
      content: '매운 음식 좋아함',
      createdAt: NOW.toISOString(),
    });
    expect(await service.list('u1')).toContainEqual(result);
    expect(await service.recall('u1')).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: '매운 음식 좋아함' })]),
    );
    expect(rows).toHaveLength(3);
  });

  it('rejects normalized duplicates across categories without adding a second memory', async () => {
    await service.create('u1', { category: 'PREFERENCE', content: '매운 음식 좋아함' });
    await expect(
      service.create('u1', { category: 'ETC', content: '매운  음식 좋아함' }),
    ).rejects.toThrow(new ConflictException('이미 기억하고 있는 내용이에요.'));
    expect(rows.filter((row) => row.userId === 'u1')).toHaveLength(2);
    expect(memory.create).toHaveBeenCalledTimes(1);
  });

  it('compares case-insensitively and only within the current owner', async () => {
    await service.create('u1', { category: 'OWNERSHIP', content: 'Air Fryer' });
    await expect(
      service.create('u1', { category: 'ETC', content: ' air   FRYER ' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.create('u1', { category: 'ALLERGY', content: '오이' }),
    ).resolves.toMatchObject({ content: '오이' });
  });

  it.each(['', '   ', '\t\n'])(
    'rejects blank create content %j without writing',
    async (content) => {
      await expect(service.create('u1', { category: 'ETC', content })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(memory.create).not.toHaveBeenCalled();
      expect(rows).toHaveLength(2);
    },
  );

  it.each(['m2', 'missing'])('does not reveal or edit unowned memory %s', async (id) => {
    await expect(service.update('u1', id, { content: '수정' })).rejects.toThrow(
      new NotFoundException('기억을 찾을 수 없어요.'),
    );
    expect(memory.findFirst).toHaveBeenCalledWith({
      where: { id, userId: 'u1' },
      select: { id: true },
    });
    expect(memory.update).not.toHaveBeenCalled();
    expect(rows[1].content).toBe('오이');
  });

  it('excludes itself from duplicate checking and preserves the original creation time', async () => {
    const result = await service.update('u1', 'm1', { category: 'ALLERGY', content: '  땅콩 ' });
    expect(result).toMatchObject({
      category: 'ALLERGY',
      content: '땅콩',
      createdAt: NOW.toISOString(),
    });
    expect(rows[0].category).toBe('ALLERGY');
    expect(rows).toHaveLength(2);
  });

  it('applies category-only and content-only patches without erasing omitted fields', async () => {
    await service.update('u1', 'm1', { category: 'ALLERGY' });
    expect(rows[0]).toMatchObject({ category: 'ALLERGY', content: '땅콩' });
    await service.update('u1', 'm1', { content: '  견과류   전부 ' });
    expect(rows[0]).toMatchObject({ category: 'ALLERGY', content: '견과류 전부' });
  });

  it('preserves a legacy long memory when only its category changes', async () => {
    const content = '오래된 기억 내용 '.repeat(6);
    rows[0].content = content;
    const result = await service.update('u1', 'm1', { category: 'PROFILE' });
    expect(result).toMatchObject({ category: 'PROFILE', content });
    expect(rows[0].content).toBe(content);
  });

  it('rejects another memory duplicate without mutating the original', async () => {
    await service.create('u1', { category: 'OWNERSHIP', content: 'Air Fryer' });
    await expect(
      service.update('u1', 'm1', { category: 'ETC', content: ' air  FRYER ' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rows[0]).toMatchObject({ category: 'PREFERENCE', content: '땅콩' });
    expect(memory.update).not.toHaveBeenCalled();
  });

  it('rejects blank edits without mutating the original', async () => {
    await expect(service.update('u1', 'm1', { content: ' \n ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(rows[0].content).toBe('땅콩');
    expect(memory.update).not.toHaveBeenCalled();
  });

  it.each([{ content: null }, { category: null }])(
    'rejects explicit null at the service boundary: %j',
    async (invalid) => {
      await expect(
        service.create('u1', {
          category: 'ETC',
          content: '내용',
          ...invalid,
        } as unknown as CreateMemoryRequestType),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.update('u1', 'm1', invalid as unknown as UpdateMemoryRequestType),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(memory.create).not.toHaveBeenCalled();
      expect(memory.update).not.toHaveBeenCalled();
      expect(rows[0]).toMatchObject({ category: 'PREFERENCE', content: '땅콩' });
    },
  );

  it('serves all five categories using copied onboarding vocab and limits', () => {
    const options = service.options();
    expect(Object.keys(options.examples)).toEqual([...MEMORY_CATEGORIES]);
    expect(options.limits.contentMax).toBe(40);
    for (const group of TAG_GROUPS) {
      expect(options.examples[group.category]).toEqual(group.options);
      expect(options.examples[group.category]).not.toBe(group.options);
    }
    options.examples.ALLERGY.length = 0;
    options.limits.contentMax = 1;
    expect(service.options().examples.ALLERGY.length).toBeGreaterThan(0);
    expect(service.options().limits).toEqual(MEMORY_LIMITS);
  });
});

describe('Memory request validation boundary', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  it.each([CreateMemoryDto, UpdateMemoryDto])(
    'rejects null, invalid categories and overlong strings in %p',
    async (metatype) => {
      for (const invalid of [
        { category: null },
        { content: null },
        { category: 'INVALID' },
        { content: 123 },
        { content: 'x'.repeat(MEMORY_LIMITS.contentMax + 1) },
      ]) {
        await expect(
          pipe.transform(
            { category: 'ETC', content: '내용', ...invalid },
            { type: 'body', metatype },
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    },
  );

  it('requires both create fields but permits omitted patch fields', async () => {
    await expect(
      pipe.transform({}, { type: 'body', metatype: CreateMemoryDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({}, { type: 'body', metatype: UpdateMemoryDto })).resolves.toEqual(
      {},
    );
    await expect(
      pipe.transform(
        { category: 'PROFILE', content: 'x'.repeat(MEMORY_LIMITS.contentMax) },
        { type: 'body', metatype: CreateMemoryDto },
      ),
    ).resolves.toMatchObject({
      category: 'PROFILE',
      content: 'x'.repeat(MEMORY_LIMITS.contentMax),
    });
  });
});
