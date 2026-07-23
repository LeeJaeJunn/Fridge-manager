import type { RecalledIngredient } from '../inventory/inventory.service';
import type { RecalledMemory } from '../memory/memory.service';
import { daysLeft, formatInventory, splitAllergies } from './conversation.service';

const mem = (content: string): RecalledMemory => ({ category: 'PROFILE', content });

const ing = (
  name: string,
  expiresAt: Date,
  extra: Partial<RecalledIngredient> = {},
): RecalledIngredient => ({
  name,
  quantityNote: null,
  expiresAt,
  expirySource: 'ESTIMATED',
  ...extra,
});

/** 시각 차이가 아니라 날짜 차이로만 판정되는지 보려고 시:분을 일부러 어긋나게 잡는다 */
const NOW = new Date(2026, 6, 22, 23, 30); // 7/22 23:30
const atNoon = (day: number) => new Date(2026, 6, day, 12, 0);

describe('프롬프트 조립', () => {
  describe('splitAllergies — 안전 정보 분리', () => {
    it('알레르기 기억을 나머지와 분리한다', () => {
      const { allergies, rest } = splitAllergies([
        mem('자취 중'),
        mem('갑각류 알레르기가 있음(먹으면 안 됨)'),
        mem('매운 음식 좋아함'),
      ]);
      expect(allergies.map((m) => m.content)).toEqual(['갑각류 알레르기가 있음(먹으면 안 됨)']);
      expect(rest).toHaveLength(2);
    });

    it('표기 흔들림(알러지·못 먹음)도 안전 쪽으로 잡는다', () => {
      const { allergies } = splitAllergies([
        mem('땅콩 알러지 있음'),
        mem('오이를 못 먹음'),
        mem('우유는 먹으면 안 됨'),
      ]);
      expect(allergies).toHaveLength(3);
    });

    it('온보딩이 시드하는 문장 형태를 반드시 잡는다', () => {
      // persona.ts 의 toMemory 가 만드는 문장 — 이게 안 잡히면 안전 섹션이 통째로 비어버린다
      const { allergies } = splitAllergies([mem('견과류 알레르기가 있음(먹으면 안 됨)')]);
      expect(allergies).toHaveLength(1);
    });

    it('알레르기가 없으면 빈 배열 (섹션 자체가 안 붙는다)', () => {
      const { allergies, rest } = splitAllergies([mem('자취 중'), mem('에어프라이어 있음')]);
      expect(allergies).toEqual([]);
      expect(rest).toHaveLength(2);
    });

    it('기억을 잃지 않는다 — 두 갈래 합이 원본과 같다', () => {
      const input = [mem('자취 중'), mem('계란 알레르기가 있음'), mem('요리 초보')];
      const { allergies, rest } = splitAllergies(input);
      expect(allergies.length + rest.length).toBe(input.length);
    });
  });

  describe('daysLeft — 자정 기준', () => {
    it('밤 11시 30분이어도 다음 날은 "1일 남음"으로 센다 (시:분에 흔들리지 않음)', () => {
      expect(daysLeft(atNoon(23), NOW)).toBe(1);
    });

    it('같은 날은 0', () => {
      expect(daysLeft(atNoon(22), NOW)).toBe(0);
    });

    it('지난 날짜는 음수', () => {
      expect(daysLeft(atNoon(20), NOW)).toBeLessThan(0);
      expect(Math.abs(daysLeft(atNoon(20), NOW))).toBe(2);
    });
  });

  describe('formatInventory', () => {
    it('비었으면 "없다"고 명시한다 (모델이 재료를 지어내지 않게)', () => {
      const text = formatInventory([], NOW);
      expect(text).toContain('등록된 재료가 없어');
    });

    it('남은 일수를 계산해 넣는다 — 모델은 오늘 날짜를 모른다', () => {
      const text = formatInventory([ing('대파', atNoon(23))], NOW);
      expect(text).toContain('내일까지');
      expect(text).not.toContain('2026-07-23'); // 날짜만 주면 판단 못 한다
    });

    it('오늘·지남을 구분해 보여준다', () => {
      const text = formatInventory([ing('우유', atNoon(22)), ing('두부', atNoon(20))], NOW);
      expect(text).toContain('오늘까지');
      expect(text).toContain('2일 지남');
    });

    it('추정 만료일은 "쯤"으로 흐려 단정하지 않게 한다', () => {
      const estimated = formatInventory([ing('계란', atNoon(30))], NOW);
      const stated = formatInventory([ing('계란', atNoon(30), { expirySource: 'USER' })], NOW);
      expect(estimated).toContain('쯤');
      expect(stated).not.toContain('쯤');
    });

    it('수량 메모가 있으면 함께, 없으면 생략한다', () => {
      expect(formatInventory([ing('계란', atNoon(30), { quantityNote: '한 판' })], NOW)).toContain(
        '(한 판)',
      );
      expect(formatInventory([ing('계란', atNoon(30))], NOW)).not.toContain('()');
    });

    it('모든 재료가 한 줄씩 들어간다', () => {
      const text = formatInventory([ing('대파', atNoon(23)), ing('계란', atNoon(30))], NOW);
      expect(text).toContain('대파');
      expect(text).toContain('계란');
    });

    // ── 안전: 금지 재료는 목록 안에서 표시된다 ──
    // (레시피를 고르는 순간 모델이 읽는 게 이 목록이라, 경고가 멀리 있으면 "임박 우선"에 밀린다)
    it('알레르기 재료는 재고 줄에 바로 경고를 붙인다', () => {
      const text = formatInventory([ing('계란', atNoon(23))], NOW, [
        mem('계란 알레르기가 있음(먹으면 안 됨)'),
      ]);
      expect(text).toContain('쓰지 마라');
    });

    it('안전한 재료엔 경고를 붙이지 않는다', () => {
      const text = formatInventory([ing('애호박', atNoon(23))], NOW, [
        mem('계란 알레르기가 있음(먹으면 안 됨)'),
      ]);
      expect(text).not.toContain('쓰지 마라');
    });

    it('금지 재료가 가장 임박해도 경고가 함께 붙는다 (임박 우선과 충돌하는 지점)', () => {
      const text = formatInventory([ing('계란', atNoon(22)), ing('애호박', atNoon(30))], NOW, [
        mem('계란 알레르기가 있음(먹으면 안 됨)'),
      ]);
      const eggLine = text.split('\n').find((l) => l.includes('계란'));
      expect(eggLine).toContain('오늘까지');
      expect(eggLine).toContain('쓰지 마라');
    });

    it('알레르기 목록을 안 주면 경고가 전혀 없다 (기존 호출부 호환)', () => {
      expect(formatInventory([ing('계란', atNoon(23))], NOW)).not.toContain('쓰지 마라');
    });
  });
});
