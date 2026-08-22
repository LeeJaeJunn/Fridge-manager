import type { RecalledIngredient } from '../inventory/inventory.service';
import type { RecalledMemory } from '../memory/memory.service';
import type { LlmInputItemType } from '../llm/llm-provider.interface';
import {
  attachContext,
  buildPrompt,
  daysLeft,
  formatInventory,
  splitMemories,
} from './conversation.prompt';

const mem = (content: string): RecalledMemory => ({ category: 'PROFILE', content });
/** 조리도구 — 별도 섹션(요리 장비)으로 간다 */
const tool = (content: string): RecalledMemory => ({ category: 'OWNERSHIP', content });
/** 먹으면 안 되는 것 — content 는 재료 이름만 (문장 아님) */
const banned = (name: string): RecalledMemory => ({ category: 'ALLERGY', content: name });

const ing = (
  name: string,
  expiresAt: Date,
  extra: Partial<RecalledIngredient> = {},
): RecalledIngredient => ({
  id: `ing-${name}`,
  name,
  category: 'ETC',
  storage: 'FRIDGE',
  quantityNote: null,
  expiresAt,
  expirySource: 'ESTIMATED',
  ...extra,
});

/** 시각 차이가 아니라 날짜 차이로만 판정되는지 보려고 시:분을 일부러 어긋나게 잡는다 */
const NOW = new Date(2026, 6, 22, 23, 30); // 7/22 23:30
const atNoon = (day: number) => new Date(2026, 6, day, 12, 0);

describe('프롬프트 조립', () => {
  describe('splitMemories — 섹션 분리 (카테고리 기준)', () => {
    it('ALLERGY 카테고리만 금지 쪽으로 간다', () => {
      const { allergies, traits } = splitMemories([
        mem('자취 중'),
        banned('갑각류'),
        mem('매운 음식 좋아함'),
      ]);
      expect(allergies.map((m) => m.content)).toEqual(['갑각류']);
      expect(traits).toHaveLength(2);
    });

    it('조리도구(OWNERSHIP)는 특성과 다른 섹션으로 간다', () => {
      // "뭘 가지고 있는지"(조리 가능 여부)와 "어떤 사람인지"(요리 선택)는 쓰임이 달라 섞으면 안 된다.
      const { equipment, traits } = splitMemories([
        tool('에어프라이어'),
        mem('요리 초보'),
        tool('전자레인지'),
      ]);
      expect(equipment.map((m) => m.content)).toEqual(['에어프라이어', '전자레인지']);
      expect(traits.map((m) => m.content)).toEqual(['요리 초보']);
    });

    it('내용에 "알레르기"가 들어 있어도 카테고리가 아니면 금지가 아니다', () => {
      // 예전엔 정규식이 content 를 훑어서 이런 문장을 금지로 잡았고, 부정문("없음")도 구분 못 했다.
      const { allergies, traits } = splitMemories([
        mem('우유 알레르기는 없음'),
        mem('알레르기 검사를 받아본 적 있음'),
      ]);
      expect(allergies).toEqual([]);
      expect(traits).toHaveLength(2);
    });

    it('온보딩이 시드하는 형태(이름만)를 그대로 담는다', () => {
      // persona.ts 의 toMemory 가 문장으로 감싸지 않는다 — 이름이 그대로 와야 목록이 깔끔하다
      const { allergies } = splitMemories([banned('견과류')]);
      expect(allergies.map((m) => m.content)).toEqual(['견과류']);
    });

    it('금지가 없으면 빈 배열 (섹션 자체가 안 붙는다)', () => {
      const { allergies, equipment, traits } = splitMemories([
        mem('자취 중'),
        tool('에어프라이어'),
      ]);
      expect(allergies).toEqual([]);
      expect(equipment).toHaveLength(1);
      expect(traits).toHaveLength(1);
    });

    it('기억을 잃지 않는다 — 세 갈래 합이 원본과 같다', () => {
      const input = [mem('자취 중'), banned('계란'), tool('인덕션'), mem('요리 초보')];
      const { allergies, equipment, traits } = splitMemories(input);
      expect(allergies.length + equipment.length + traits.length).toBe(input.length);
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

    it('추정 만료일은 "(추정)"으로 밝혀 단정하지 않게 한다', () => {
      const estimated = formatInventory([ing('계란', atNoon(30))], NOW);
      const stated = formatInventory([ing('계란', atNoon(30), { expirySource: 'USER' })], NOW);
      expect(estimated).toContain('8일 남음 (추정)');
      expect(stated).not.toContain('(추정)');
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

    it('재고 블록에는 재고 정보만 넣는다 (금지 표시는 전용 블록이 맡는다)', () => {
      const text = formatInventory([ing('계란', atNoon(23))], NOW);
      expect(text).not.toContain('쓰지 마라');
      expect(text).not.toContain('⚠️');
    });
  });

  /**
   * 문구가 아니라 **순서와 경계**를 고정한다. 문구는 계속 다듬을 거라 스냅샷으로 묶으면
   * 튜닝할 때마다 테스트가 깨져서 오히려 방해가 된다. 여기선 "무엇이 어느 쪽에, 몇 번째로"만 본다.
   */
  describe('buildPrompt — 조립 순서와 정적/동적 경계', () => {
    /** 섹션 헤더 — 낱말이 아니라 이 표시로 "섹션이 있느냐"를 본다(지침 문장에도 같은 낱말이 나온다) */
    const EQUIPMENT = '# 요리 장비';
    const TRAITS = '# 사용자 특성';
    const INVENTORY = '# 냉장고 재고';
    const BANNED = '# ⚠️ 알레르기';

    const ctx = {
      character: { name: '초코', speechStyle: 'casual' },
      userName: '재준',
      memories: [mem('매운 음식 좋아함'), tool('에어프라이어'), banned('갑각류')],
      inventory: [ing('대파', atNoon(23))],
      now: NOW,
    };

    it('정적 블록에는 페르소나·규칙만, 데이터는 안 들어간다', () => {
      const { system } = buildPrompt(ctx);
      expect(system).toContain('초코'); // 캐릭터 이름
      expect(system).toContain('재준'); // 사용자 이름 (예전엔 별도 '호칭' 도 있었으나 걷어냄)
      expect(system).toContain('반말');
      expect(system).toContain('대화 규칙');
      expect(system).toContain('요리 추천');
      expect(system).toContain('금지사항');
      // 턴마다 바뀌는 것은 여기 있으면 안 된다 (캐싱 절단선).
      // 지침 예시에도 재료 이름·"먹으면 안 되는 재료" 같은 표현이 나오므로 **섹션 헤더**로 본다.
      expect(system).not.toContain(INVENTORY);
      expect(system).not.toContain(TRAITS);
      expect(system).not.toContain(EQUIPMENT);
      expect(system).not.toContain(BANNED);
      expect(system).not.toContain('매운 음식 좋아함');
    });

    it('동적 블록에는 장비·특성·재고·금지 재료만 들어간다', () => {
      const { context } = buildPrompt(ctx);
      expect(context).toContain('에어프라이어');
      expect(context).toContain('매운 음식 좋아함');
      expect(context).toContain('대파');
      expect(context).toContain('갑각류');
      expect(context).not.toContain('대화 규칙');
    });

    it('조리도구와 사용자 특성은 서로 다른 섹션이다', () => {
      const { context } = buildPrompt(ctx);
      const traitsPart = context.slice(context.indexOf(TRAITS), context.indexOf(INVENTORY));
      expect(context).toContain(EQUIPMENT);
      expect(traitsPart).toContain('매운 음식 좋아함');
      expect(traitsPart).not.toContain('에어프라이어'); // 장비가 특성 목록에 섞이면 안 된다
    });

    it('금지 재료 블록이 **맨 끝**이다 (임박 재료 우선 규칙에 밀리지 않게)', () => {
      const { context } = buildPrompt(ctx);
      const at = context.indexOf(BANNED);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeGreaterThan(context.indexOf(INVENTORY));
      expect(at).toBeGreaterThan(context.indexOf(TRAITS));
      expect(at).toBeGreaterThan(context.indexOf(EQUIPMENT));
      // 뒤에 다른 섹션이 붙지 않았는지 — 마지막 '#' 섹션이 금지 재료여야 한다
      expect(context.lastIndexOf('\n# ')).toBeLessThan(at);
    });

    it('알레르기는 특성 목록이 아니라 금지 재료 쪽으로 간다', () => {
      const { context } = buildPrompt(ctx);
      const beforeInventory = context.slice(0, context.indexOf(INVENTORY));
      expect(beforeInventory).not.toContain('갑각류');
    });

    it('비어 있는 블록은 섹션 자체가 안 붙는다', () => {
      const { context } = buildPrompt({ ...ctx, memories: [], inventory: [] });
      expect(context).not.toContain(TRAITS);
      expect(context).not.toContain(EQUIPMENT);
      expect(context).not.toContain(BANNED);
      expect(context).toContain('아직 등록된 재료가 없어'); // 비었다는 건 명시해야 한다
    });
  });

  /**
   * 상태는 **보낼 때만** 마지막 사용자 메시지에 얹힌다. DB 엔 원문만 남는다.
   * 지난 user 메시지가 오염되면 옛 재고가 히스토리에 유령처럼 남고 프리픽스 캐시도 죽는다.
   */
  describe('attachContext — 상태를 마지막 사용자 메시지에만', () => {
    const text = (role: 'user' | 'assistant', content: string): LlmInputItemType => ({
      type: 'text',
      role,
      content,
    });
    const call: LlmInputItemType = {
      type: 'function_call',
      callId: 'c1',
      name: 'update_inventory',
      arguments: {},
    };
    const contextText = '# 지금 냉장고에 있는 재료 (임박순)\n- 대파 · 내일까지';
    const contentOf = (item: LlmInputItemType) => (item.type === 'text' ? item.content : '');

    it('마지막 사용자 메시지에만 붙는다', () => {
      const items = [text('user', '첫 질문'), text('assistant', '답'), text('user', '두번째 질문')];
      const out = attachContext(items, contextText);

      expect(contentOf(out[2])).toContain('대파');
      expect(contentOf(out[2])).toContain('두번째 질문');
    });

    it('지난 사용자 메시지는 원문 그대로다 (히스토리 오염 방지)', () => {
      const items = [text('user', '첫 질문'), text('assistant', '답'), text('user', '두번째 질문')];
      const out = attachContext(items, contextText);

      expect(contentOf(out[0])).toBe('첫 질문');
      expect(contentOf(out[1])).toBe('답');
    });

    it('시스템이 붙인 정보임을 밝힌다 (사용자가 친 걸로 오해하지 않게)', () => {
      const out = attachContext([text('user', '뭐 해먹지')], contextText);
      const body = contentOf(out[0]);
      expect(body).toContain('사용자가 입력한 것이 아니다');
      expect(body.indexOf('대파')).toBeLessThan(body.indexOf('뭐 해먹지')); // 질문이 맨 뒤
    });

    it('원본 배열·아이템을 변형하지 않는다', () => {
      const items = [text('user', '원문')];
      const out = attachContext(items, contextText);

      expect(contentOf(items[0])).toBe('원문');
      expect(out).not.toBe(items);
    });

    it('context 가 비면 그대로 반환한다', () => {
      const items = [text('user', '원문')];
      expect(attachContext(items, '   ')).toBe(items);
    });

    it('툴 호출·결과 아이템은 건드리지 않는다', () => {
      const items = [call, text('user', '질문')];
      const out = attachContext(items, contextText);

      expect(out[0]).toBe(call);
      expect(contentOf(out[1])).toContain('대파');
    });

    it('사용자 메시지가 없으면 상태를 잃지 않게 아이템으로 덧붙인다', () => {
      const out = attachContext([text('assistant', '안녕')], contextText);
      expect(out).toHaveLength(2);
      expect(out[1]).toMatchObject({ type: 'text', role: 'user' });
      expect(contentOf(out[1])).toContain('대파');
    });
  });
});
