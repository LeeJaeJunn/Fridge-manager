import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SavedDishService } from './saved-dish.service';

/** 인자를 unknown 으로 고정해 둔다 — 기본 jest.Mock 은 calls 가 any 라 lint 가 막는다. */
type QueryMock = jest.Mock<Promise<unknown>, [unknown]>;

type PrismaMock = {
  message: {
    findFirst: QueryMock;
  };
  savedDish: {
    findMany: QueryMock;
    findFirst: QueryMock;
    create: QueryMock;
    update: QueryMock;
    deleteMany: QueryMock;
  };
};

type WriteArgs = {
  where?: { id?: string; userId?: string };
  data: {
    userId?: string;
    sourceMessageId?: string;
    dishName?: string;
    servings?: number;
    cookMinutes?: number | null;
    ingredients?: unknown;
    steps?: unknown;
  };
};

type DeleteArgs = { where: { id: string; userId: string } };

const writeArg = (m: QueryMock): WriteArgs => m.mock.calls[0][0] as WriteArgs;
const deleteArg = (m: QueryMock): DeleteArgs => m.mock.calls[0][0] as DeleteArgs;

const NOW = new Date('2026-09-16T00:00:00.000Z');
const REQUEST = {
  sourceMessageId: 'm1',
  dishName: '김치찌개',
  servings: 2,
  ingredients: [{ name: '김치', amount: '200g' }],
  steps: ['끓인다'],
};

/** create/update 로 넘어간 data 를 저장된 행처럼 되돌린다. */
const echoRow = () =>
  jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'sd1',
      sourceMessageId: 'm1',
      dishName: '김치찌개',
      servings: 2,
      cookMinutes: null,
      ingredients: [],
      steps: [],
      createdAt: NOW,
      updatedAt: NOW,
      ...data,
    }),
  );

describe('SavedDishService', () => {
  let prisma: PrismaMock;
  let service: SavedDishService;

  beforeEach(() => {
    prisma = {
      message: {
        findFirst: jest.fn().mockResolvedValue({ payload: { name: 'propose_dish' } }),
      },
      savedDish: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'sd1' }),
        create: echoRow(),
        update: echoRow(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new SavedDishService(prisma as unknown as PrismaService);
  });

  describe('save', () => {
    it('내 대화의 요리 카드가 아니면 저장하지 않는다', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      await expect(service.save('u1', REQUEST)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'm1',
          type: 'FUNCTION_CALL',
          conversation: { userId: 'u1' },
        },
        select: { payload: true },
      });
      expect(prisma.savedDish.create).not.toHaveBeenCalled();
    });

    it('propose_dish 가 아닌 툴 카드는 저장하지 않는다', async () => {
      prisma.message.findFirst.mockResolvedValue({ payload: { name: 'update_inventory' } });

      await expect(service.save('u1', REQUEST)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.savedDish.create).not.toHaveBeenCalled();
    });

    it('카드 스냅샷을 저장하고 생략한 조리시간은 null 로 기록한다', async () => {
      await service.save('u1', REQUEST);

      expect(writeArg(prisma.savedDish.create).data).toEqual({
        userId: 'u1',
        sourceMessageId: 'm1',
        dishName: '김치찌개',
        servings: 2,
        cookMinutes: null,
        ingredients: [{ name: '김치', amount: '200g' }],
        steps: ['끓인다'],
      });
    });

    it('같은 카드를 다시 저장하면 ConflictException 으로 바꾼다', async () => {
      prisma.savedDish.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.save('u1', REQUEST)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('내 저장본이 아니면 수정하지 않는다', async () => {
      prisma.savedDish.findFirst.mockResolvedValue(null);

      await expect(service.update('u1', 'sd-other', { dishName: '수정' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.savedDish.update).not.toHaveBeenCalled();
    });

    it('조리시간 생략은 미변경(undefined)으로 넘긴다', async () => {
      await service.update('u1', 'sd1', { dishName: '수정' });

      expect(writeArg(prisma.savedDish.update).data.cookMinutes).toBeUndefined();
    });

    it('조리시간 null 은 미설정으로 되돌리는 값으로 넘긴다', async () => {
      await service.update('u1', 'sd1', { cookMinutes: null });

      expect(writeArg(prisma.savedDish.update).data.cookMinutes).toBeNull();
    });
  });

  it('remove 는 id 와 userId 를 함께 묶어 멱등 삭제한다', async () => {
    await service.remove('u1', 'sd1');

    expect(deleteArg(prisma.savedDish.deleteMany)).toEqual({ where: { id: 'sd1', userId: 'u1' } });
  });
});
