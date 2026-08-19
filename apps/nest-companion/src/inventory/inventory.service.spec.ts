import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';
import { LIMITS, shelfLifeDays } from './shelf-life';

/** 인자를 unknown 으로 고정해 둔다 — 기본 jest.Mock 은 calls 가 any 라 lint 가 막는다. */
type QueryMock = jest.Mock<Promise<unknown>, [unknown]>;

type PrismaMock = {
  ingredient: {
    findMany: QueryMock;
    findFirst: QueryMock;
    create: QueryMock;
    update: QueryMock;
    updateMany: QueryMock;
    deleteMany: QueryMock;
  };
};

const MS_PER_DAY = 86_400_000;

/**
 * prisma mock 에 넘어간 인자 모양. jest.Mock 의 calls 는 any 라 그대로 쓰면 lint 가 막으므로
 * 아래 writeArg/readArg 로 한 번 좁혀서 꺼낸다.
 */
type WriteArgs = {
  where?: { id?: string; userId?: string; consumedAt?: Date | null };
  data: {
    userId: string;
    name: string;
    category: string;
    quantityNote: string | null;
    storage: string;
    addedAt: Date;
    expiresAt: Date;
    expirySource: string;
    consumedAt: Date | null;
  };
};

type ReadArgs = {
  where: {
    userId?: string;
    consumedAt?: Date | null;
    expiresAt?: { lte: Date; gte?: Date };
  };
  orderBy?: { expiresAt?: string; name?: string }[];
};

const writeArg = (m: QueryMock, i = 0): WriteArgs => m.mock.calls[i][0] as WriteArgs;
const readArg = (m: QueryMock, i = 0): ReadArgs => m.mock.calls[i][0] as ReadArgs;

/** create/update 로 넘어간 data 를 그대로 row 처럼 되돌려주는 헬퍼 (저장 계층은 관심사가 아님) */
const echoRow = (overrides: Record<string, unknown> = {}) =>
  jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'generated-id',
      name: 'x',
      category: 'ETC',
      quantityNote: null,
      storage: 'FRIDGE',
      addedAt: new Date(),
      expiresAt: new Date(),
      expirySource: 'ESTIMATED',
      consumedAt: null,
      ...data,
      ...overrides,
    }),
  );

describe('InventoryService', () => {
  let prisma: PrismaMock;
  let service: InventoryService;

  beforeEach(() => {
    prisma = {
      ingredient: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: echoRow(),
        update: echoRow(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new InventoryService(prisma as unknown as PrismaService);
  });

  describe('add', () => {
    it('만료일을 안 줘도 카테고리 기준으로 추정해 항상 채운다', async () => {
      await service.add('u1', [{ name: '삼겹살', category: 'MEAT', storage: 'FRIDGE' }]);

      const { data } = writeArg(prisma.ingredient.create);
      expect(data.expirySource).toBe('ESTIMATED');
      const days = Math.round((data.expiresAt.getTime() - data.addedAt.getTime()) / MS_PER_DAY);
      expect(days).toBe(shelfLifeDays('MEAT', 'FRIDGE'));
    });

    it('사용자가 표기일을 주면 그 값을 쓰고 USER 로 표시한다', async () => {
      const expiresAt = new Date(Date.now() + 40 * MS_PER_DAY);
      await service.add('u1', [
        { name: '우유', category: 'DAIRY', expiresAt: expiresAt.toISOString() },
      ]);

      const { data } = writeArg(prisma.ingredient.create);
      expect(data.expirySource).toBe('USER');
      expect(data.expiresAt.toISOString()).toBe(expiresAt.toISOString());
    });

    it('category/storage 를 생략하면 ETC/FRIDGE 기본값을 쓴다', async () => {
      await service.add('u1', [{ name: '뭔가' }]);

      const { data } = writeArg(prisma.ingredient.create);
      expect(data.category).toBe('ETC');
      expect(data.storage).toBe('FRIDGE');
    });

    it('빈 이름은 건너뛴다', async () => {
      const saved = await service.add('u1', [{ name: '   ' }, { name: '계란' }]);
      expect(saved).toHaveLength(1);
      expect(prisma.ingredient.create).toHaveBeenCalledTimes(1);
    });

    it('같은 이름의 미소비 재고가 있으면 새로 만들지 않고 병합한다', async () => {
      prisma.ingredient.findMany.mockResolvedValue([
        {
          id: 'existing',
          name: '계란',
          category: 'EGG',
          quantityNote: '반 판',
          storage: 'FRIDGE',
          addedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * MS_PER_DAY),
          expirySource: 'ESTIMATED',
          consumedAt: null,
        },
      ]);

      await service.add('u1', [{ name: ' 계란 ', category: 'EGG' }]);

      expect(prisma.ingredient.create).not.toHaveBeenCalled();
      expect(prisma.ingredient.update).toHaveBeenCalledTimes(1);
      expect(writeArg(prisma.ingredient.update).where).toEqual({ id: 'existing' });
    });

    it('병합 시 만료일을 새로 산 것 기준으로 갱신한다 (재입고 = 새 물건이 주)', async () => {
      const oldExpiry = new Date(Date.now() + 1 * MS_PER_DAY);
      prisma.ingredient.findMany.mockResolvedValue([
        {
          id: 'existing',
          name: '계란',
          category: 'EGG',
          quantityNote: null,
          storage: 'FRIDGE',
          addedAt: new Date(),
          expiresAt: oldExpiry,
          expirySource: 'ESTIMATED',
          consumedAt: null,
        },
      ]);

      // EGG/FRIDGE 추정은 3주 → 옛 만료일(1일)이 아니라 새로 추정한 값으로 갱신돼야 한다
      await service.add('u1', [{ name: '계란', category: 'EGG' }]);

      const { data } = writeArg(prisma.ingredient.update);
      const days = Math.round((data.expiresAt.getTime() - Date.now()) / MS_PER_DAY);
      expect(days).toBe(shelfLifeDays('EGG', 'FRIDGE'));
      expect(data.expiresAt).not.toEqual(oldExpiry);
    });

    it('병합에서도 사용자가 준 표기일이면 USER 로 표시한다', async () => {
      const stated = new Date(Date.now() + 10 * MS_PER_DAY);
      prisma.ingredient.findMany.mockResolvedValue([
        {
          id: 'existing',
          name: '우유',
          category: 'DAIRY',
          quantityNote: null,
          storage: 'FRIDGE',
          addedAt: new Date(),
          expiresAt: new Date(Date.now() + 1 * MS_PER_DAY),
          expirySource: 'ESTIMATED',
          consumedAt: null,
        },
      ]);

      await service.add('u1', [{ name: '우유', expiresAt: stated.toISOString() }]);

      const { data } = writeArg(prisma.ingredient.update);
      expect(data.expiresAt.toISOString()).toBe(stated.toISOString());
      expect(data.expirySource).toBe('USER');
    });

    it('병합 시 이번에 수량을 안 적으면 기존 수량 메모를 유지한다', async () => {
      prisma.ingredient.findMany.mockResolvedValue([
        {
          id: 'existing',
          name: '계란',
          category: 'EGG',
          quantityNote: '한 판',
          storage: 'FRIDGE',
          addedAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * MS_PER_DAY),
          expirySource: 'ESTIMATED',
          consumedAt: null,
        },
      ]);

      await service.add('u1', [{ name: '계란', category: 'EGG' }]);

      expect(writeArg(prisma.ingredient.update).data.quantityNote).toBe('한 판');
    });

    it('한 번에 넣을 수 있는 개수를 상한선으로 자른다', async () => {
      const many = Array.from({ length: 100 }, (_, i) => ({ name: `재료${i}` }));
      const saved = await service.add('u1', many);
      expect(saved.length).toBeLessThanOrEqual(30);
    });
  });

  describe('list / recall', () => {
    it('아직 안 먹은 것만 임박순으로 읽는다', async () => {
      await service.list('u1');
      const arg = readArg(prisma.ingredient.findMany);
      expect(arg.where).toEqual({ userId: 'u1', consumedAt: null });
      expect(arg.orderBy?.[0]).toEqual({ expiresAt: 'asc' });
    });

    it('recall 도 소비한 재료를 빼고 준다 (프롬프트에 유령 재료가 들어가면 안 된다)', async () => {
      await service.recall('u1');
      expect(readArg(prisma.ingredient.findMany).where).toEqual({
        userId: 'u1',
        consumedAt: null,
      });
    });
  });

  describe('expiringSoon', () => {
    it('days 만큼의 창 안에 있는 것만, 소비한 건 빼고 조회한다', async () => {
      const before = Date.now();
      await service.expiringSoon('u1', 3);

      const { where } = readArg(prisma.ingredient.findMany);
      expect(where.userId).toBe('u1');
      expect(where.consumedAt).toBeNull();
      // 없으면 NaN → 아래 비교가 전부 실패한다 (조용히 통과하지 않게)
      const cutoff = where.expiresAt?.lte.getTime() ?? Number.NaN;
      expect(cutoff).toBeGreaterThanOrEqual(before + 3 * MS_PER_DAY);
      expect(cutoff).toBeLessThan(before + 3 * MS_PER_DAY + 5_000);
    });

    it('이미 지난 것도 포함한다 (상한만 있고 하한이 없다)', async () => {
      await service.expiringSoon('u1', 3);
      const { where } = readArg(prisma.ingredient.findMany);
      expect(where.expiresAt.gte).toBeUndefined();
    });
  });

  describe('consume / restore', () => {
    it('soft delete — 삭제가 아니라 consumedAt 을 찍는다', async () => {
      await service.consume('u1', ['i1']);
      const arg = writeArg(prisma.ingredient.updateMany);
      expect(arg.data.consumedAt).toBeInstanceOf(Date);
      expect(prisma.ingredient.deleteMany).not.toHaveBeenCalled();
    });

    it('이미 소비한 건 다시 건드리지 않는다 (멱등)', async () => {
      await service.consume('u1', ['i1']);
      expect(writeArg(prisma.ingredient.updateMany).where.consumedAt).toBeNull();
    });

    it('빈 배열이면 쿼리를 아예 안 날린다', async () => {
      expect(await service.consume('u1', [])).toBe(0);
      expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
    });

    it('restore 는 consumedAt 을 지워 되돌린다', async () => {
      await service.restore('u1', 'i1');
      expect(writeArg(prisma.ingredient.updateMany).data).toEqual({ consumedAt: null });
    });

    it('남의 재료는 못 건드린다 (userId 로 격리)', async () => {
      await service.consume('u1', ['i1']);
      expect(writeArg(prisma.ingredient.updateMany).where.userId).toBe('u1');
    });
  });

  describe('previewAdd', () => {
    it('같은 이름이 두 번 오면 첫 번째만 남긴다 (확인 카드에 두 줄로 안 뜨게)', () => {
      const preview = service.previewAdd([
        { name: '계란', quantityNote: '한 판' },
        { name: ' 계란 ', quantityNote: '5개' },
      ]);

      expect(preview).toHaveLength(1);
      expect(preview[0].quantityNote).toBe('한 판'); // first-wins — resolveConsume 과 같은 방향
    });

    it('중복은 itemsMax 정원을 잡아먹지 않는다 (자르기 전에 제거)', () => {
      const dupes = Array.from({ length: LIMITS.itemsMax }, () => ({ name: '계란' }));
      const preview = service.previewAdd([...dupes, { name: '대파' }]);

      expect(preview.map((p) => p.name)).toEqual(['계란', '대파']);
    });

    it('이름이 다르면 그대로 둔다', () => {
      const preview = service.previewAdd([{ name: '계란' }, { name: '대파' }]);
      expect(preview.map((p) => p.name)).toEqual(['계란', '대파']);
    });
  });

  describe('update', () => {
    // findFirst 는 재추정 판단에 쓸 현재 상태를 돌려준다(id 만이 아니다).
    const ownedRow = (over: Record<string, unknown> = {}) => ({
      category: 'PROCESSED',
      storage: 'FRIDGE',
      addedAt: new Date(),
      expirySource: 'ESTIMATED',
      ...over,
    });

    it('남의 재료를 고치려 하면 NotFoundException', async () => {
      prisma.ingredient.findFirst.mockResolvedValue(null);
      await expect(service.update('u1', 'other', { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('만료일을 직접 고치면 추정치가 USER 로 승격된다', async () => {
      prisma.ingredient.findFirst.mockResolvedValue(ownedRow());
      const stated = new Date(Date.now() + 5 * MS_PER_DAY);

      await service.update('u1', 'i1', { expiresAt: stated.toISOString() });

      const { data } = writeArg(prisma.ingredient.update);
      expect(data.expirySource).toBe('USER');
      expect(data.expiresAt.toISOString()).toBe(stated.toISOString());
    });

    it('분류·보관을 안 바꾸면 만료일·expirySource 를 건드리지 않는다', async () => {
      prisma.ingredient.findFirst.mockResolvedValue(ownedRow());
      await service.update('u1', 'i1', { quantityNote: '반 팩' });
      const { data } = writeArg(prisma.ingredient.update);
      expect(data.expirySource).toBeUndefined();
      expect(data.expiresAt).toBeUndefined();
    });

    it('보관을 바꾸면 만료일을 재추정한다 (냉장→냉동은 더 오래간다)', async () => {
      const addedAt = new Date();
      prisma.ingredient.findFirst.mockResolvedValue(ownedRow({ category: 'MEAT', addedAt }));

      await service.update('u1', 'i1', { storage: 'FREEZER' });

      const { data } = writeArg(prisma.ingredient.update);
      const days = Math.round((data.expiresAt.getTime() - addedAt.getTime()) / MS_PER_DAY);
      expect(days).toBe(shelfLifeDays('MEAT', 'FREEZER'));
      expect(days).toBeGreaterThan(shelfLifeDays('MEAT', 'FRIDGE'));
    });

    it('유저가 확정한 만료일(USER)은 보관을 바꿔도 재추정하지 않는다', async () => {
      prisma.ingredient.findFirst.mockResolvedValue(ownedRow({ expirySource: 'USER' }));
      await service.update('u1', 'i1', { storage: 'FREEZER' });
      expect(writeArg(prisma.ingredient.update).data.expiresAt).toBeUndefined();
    });
  });
});
