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
    it('만료일을 안 주면 추정하지 않는다 (컬럼 기본값 null·NONE 에 맡긴다)', async () => {
      await service.add('u1', [{ name: '삼겹살', category: 'MEAT', storage: 'FRIDGE' }]);

      // 두 필드를 **아예 안 쓴다** — 그래야 병합 경로에서 같은 코드가 "기존 값 유지"가 된다.
      // 신규 행은 스키마 기본값(`expiresAt` null · `expirySource` NONE)을 그대로 받는다.
      const { data } = writeArg(prisma.ingredient.create);
      expect(data.expiresAt).toBeUndefined();
      expect(data.expirySource).toBeUndefined();
    });

    it('앱이 "기본값"으로 계산해 보낸 날짜는 ESTIMATED 로 기록한다', async () => {
      // 추정은 서버가 아니라 **사용자가 기본값을 골랐을 때 앱이** 계산해 실어 보낸다.
      // 날짜는 USER 와 똑같이 저장되고, 출처만 갈린다(나중에 "직접 넣는가"를 재기 위한 기록).
      const estimated = new Date(Date.now() + shelfLifeDays('MEAT', 'FRIDGE') * MS_PER_DAY);
      await service.add('u1', [
        {
          name: '삼겹살',
          category: 'MEAT',
          expiresAt: estimated.toISOString(),
          expirySource: 'ESTIMATED',
        },
      ]);

      const { data } = writeArg(prisma.ingredient.create);
      expect(data.expiresAt.toISOString()).toBe(estimated.toISOString());
      expect(data.expirySource).toBe('ESTIMATED');
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

    it('병합 시 만료일을 안 주면 기존 날짜를 유지한다 (조용한 데이터 손실 방지)', async () => {
      // 채팅 툴은 날짜를 거의 안 실어 보낸다. 생략을 "지워라"로 읽으면 **"계란 더 샀어" 한 마디에
      // 애써 넣어둔 유통기한이 날아간다** — 사용자가 알아채기 어려운 손실이라 스펙으로 고정한다.
      const kept = new Date(Date.now() + 5 * MS_PER_DAY);
      prisma.ingredient.findMany.mockResolvedValue([
        {
          id: 'existing',
          name: '계란',
          category: 'EGG',
          quantityNote: null,
          storage: 'FRIDGE',
          addedAt: new Date(),
          expiresAt: kept,
          expirySource: 'USER',
          consumedAt: null,
        },
      ]);

      await service.add('u1', [{ name: '계란', category: 'EGG' }]);

      // 만료일 필드를 **UPDATE 에 싣지 않는 것**이 곧 "기존 값 유지"다.
      // (null 을 실으면 기존 날짜가 지워진다 — 그게 이 테스트가 막는 회귀다)
      const { data } = writeArg(prisma.ingredient.update);
      expect(data.expiresAt).toBeUndefined();
      expect(data.expirySource).toBeUndefined();
    });

    it('병합 시 새 날짜가 오면 그 값으로 갱신한다 (재입고 = 새 물건이 주)', async () => {
      prisma.ingredient.findMany.mockResolvedValue([
        {
          id: 'existing',
          name: '계란',
          category: 'EGG',
          quantityNote: null,
          storage: 'FRIDGE',
          addedAt: new Date(),
          expiresAt: new Date(Date.now() + 1 * MS_PER_DAY),
          expirySource: 'USER',
          consumedAt: null,
        },
      ]);

      const fresh = new Date(Date.now() + 21 * MS_PER_DAY);
      await service.add('u1', [{ name: '계란', category: 'EGG', expiresAt: fresh.toISOString() }]);

      const { data } = writeArg(prisma.ingredient.update);
      expect(data.expiresAt.toISOString()).toBe(fresh.toISOString());
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
      // ⚠️ `gte` 만 보면 `expiresAt` 자체가 없을 때도 통과한다(= 상한도 없는 상태를 놓친다).
      // 상한이 있다는 것부터 확인해야 "상한만 있고 하한이 없다"가 실제로 검증된다.
      expect(where.expiresAt).toBeDefined();
      expect(where.expiresAt?.gte).toBeUndefined();
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
      // `where` 가 아예 없으면 undefined 라 toBeNull() 이 실패한다 — 조용히 통과하지 않는다.
      expect(writeArg(prisma.ingredient.updateMany).where?.consumedAt).toBeNull();
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
      expect(writeArg(prisma.ingredient.updateMany).where?.userId).toBe('u1');
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
    // 소유권 확인만 하므로 findFirst 는 id 만 돌려주면 된다
    // (서버가 만료일을 계산하지 않게 되면서 기존 분류·보관·등록일이 필요 없어졌다).
    const ownedRow = () => ({ id: 'i1' });

    it('남의 재료를 고치려 하면 NotFoundException', async () => {
      prisma.ingredient.findFirst.mockResolvedValue(null);
      await expect(service.update('u1', 'other', { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    // 만료일은 **세 갈래**다 — 생략 / 날짜 / null. 아래 셋이 그 셋을 하나씩 고정한다.
    it('생략하면 만료일·expirySource 를 건드리지 않는다', async () => {
      prisma.ingredient.findFirst.mockResolvedValue(ownedRow());
      await service.update('u1', 'i1', { quantityNote: '반 팩' });
      const { data } = writeArg(prisma.ingredient.update);
      expect(data.expiresAt).toBeUndefined();
      expect(data.expirySource).toBeUndefined();
    });

    it('날짜를 주면 그 값 + USER 로 기록한다', async () => {
      prisma.ingredient.findFirst.mockResolvedValue(ownedRow());
      const stated = new Date(Date.now() + 5 * MS_PER_DAY);

      await service.update('u1', 'i1', { expiresAt: stated.toISOString() });

      const { data } = writeArg(prisma.ingredient.update);
      expect(data.expiresAt.toISOString()).toBe(stated.toISOString());
      expect(data.expirySource).toBe('USER');
    });

    it('null 을 주면 미설정으로 되돌린다 (생략과 다른 뜻이다)', async () => {
      // 미설정이 정상 상태가 되면서 생긴 조작이다. `@IsOptional()` 이 null 을 통과시키고
      // 서비스가 `=== null` 로 가르는데, 한쪽만 어긋나면 **날짜를 지울 방법이 사라진다.**
      prisma.ingredient.findFirst.mockResolvedValue(ownedRow());
      await service.update('u1', 'i1', { expiresAt: null });
      const { data } = writeArg(prisma.ingredient.update);
      expect(data.expiresAt).toBeNull();
      expect(data.expirySource).toBe('NONE');
    });

    it('앱이 "기본값"으로 보낸 날짜는 ESTIMATED 로 기록한다', async () => {
      prisma.ingredient.findFirst.mockResolvedValue(ownedRow());
      const estimated = new Date(Date.now() + 30 * MS_PER_DAY);

      await service.update('u1', 'i1', {
        expiresAt: estimated.toISOString(),
        expirySource: 'ESTIMATED',
      });

      expect(writeArg(prisma.ingredient.update).data.expirySource).toBe('ESTIMATED');
    });

    it('보관을 바꿔도 만료일을 건드리지 않는다 (서버는 추정하지 않는다)', async () => {
      // 예전엔 여기서 재추정했다(`reEstimate`). 그건 **앱이 날짜를 안 보내던 시절의 보완 장치**라,
      // 지금은 폼이 분류·보관을 바꿀 때마다 추정일을 다시 계산해 그 값을 실어 보낸다.
      // 서버가 한 번 더 계산하면 화면에 본 날짜와 저장된 날짜가 갈라질 수 있다.
      prisma.ingredient.findFirst.mockResolvedValue(ownedRow());
      await service.update('u1', 'i1', { storage: 'FREEZER', category: 'MEAT' });
      const { data } = writeArg(prisma.ingredient.update);
      expect(data.expiresAt).toBeUndefined();
      expect(data.expirySource).toBeUndefined();
    });
  });
});
