import { estimateExpiry, inventoryOptions, LIMITS, shelfLifeDays } from './shelf-life';

const MS_PER_DAY = 86_400_000;
const daysBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);

describe('shelf-life', () => {
  describe('shelfLifeDays', () => {
    it('같은 재료는 냉동 > 냉장 > 실온 순으로 오래간다', () => {
      const freezer = shelfLifeDays('MEAT', 'FREEZER');
      const fridge = shelfLifeDays('MEAT', 'FRIDGE');
      const pantry = shelfLifeDays('MEAT', 'PANTRY');
      expect(freezer).toBeGreaterThan(fridge);
      expect(fridge).toBeGreaterThan(pantry);
    });

    it('냉장 기준으로 해산물이 달걀보다 훨씬 빨리 상한다', () => {
      expect(shelfLifeDays('SEAFOOD', 'FRIDGE')).toBeLessThan(shelfLifeDays('EGG', 'FRIDGE'));
    });

    it('건조 곡물은 실온이 냉장보다 오래간다 (쌀·건면)', () => {
      expect(shelfLifeDays('GRAIN', 'PANTRY')).toBeGreaterThan(shelfLifeDays('GRAIN', 'FRIDGE'));
    });

    it('모르는 카테고리·보관위치는 안전하게 짧은 기본값으로 떨어진다', () => {
      expect(shelfLifeDays('NOT_A_CATEGORY', 'FRIDGE')).toBe(7);
      expect(shelfLifeDays('MEAT', 'NOT_A_STORAGE')).toBe(7);
    });
  });

  describe('estimateExpiry', () => {
    const addedAt = new Date('2026-07-21T09:00:00.000Z');

    it('등록 시점에 카테고리 소비기한을 더한 날짜를 준다', () => {
      const expiry = estimateExpiry('MEAT', 'FRIDGE', addedAt);
      expect(daysBetween(addedAt, expiry)).toBe(shelfLifeDays('MEAT', 'FRIDGE'));
    });

    it('항상 등록 시점보다 미래다 (임박 정렬이 성립하려면 필수)', () => {
      for (const category of ['VEGETABLE', 'MEAT', 'SEAFOOD', 'DAIRY', 'EGG', 'ETC'] as const) {
        for (const storage of ['FRIDGE', 'FREEZER', 'PANTRY'] as const) {
          expect(estimateExpiry(category, storage, addedAt).getTime()).toBeGreaterThan(
            addedAt.getTime(),
          );
        }
      }
    });

    it('입력한 addedAt 을 변형하지 않는다', () => {
      const original = addedAt.getTime();
      estimateExpiry('DAIRY', 'FRIDGE', addedAt);
      expect(addedAt.getTime()).toBe(original);
    });
  });

  describe('inventoryOptions', () => {
    it('모든 카테고리·보관위치에 한국어 라벨이 붙어 나온다', () => {
      const options = inventoryOptions();
      expect(options.categories.length).toBeGreaterThan(0);
      expect(options.storages).toHaveLength(3);
      for (const o of [...options.categories, ...options.storages]) {
        expect(o.label.trim().length).toBeGreaterThan(0);
      }
    });

    it('limits 를 함께 내려준다 (클라 폼이 같은 값을 쓰도록)', () => {
      expect(inventoryOptions().limits).toEqual(LIMITS);
    });

    it('limits 는 복사본이라 호출자가 원본을 못 바꾼다', () => {
      const first = inventoryOptions().limits;
      first.nameMax = 1;
      expect(inventoryOptions().limits.nameMax).toBe(LIMITS.nameMax);
    });
  });
});
