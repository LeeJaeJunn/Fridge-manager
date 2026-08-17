/**
 * 대화 프롬프트 조립 — **순서와 정적/동적 경계를 이 파일 하나가 소유한다.**
 *
 * 예전엔 문구가 `character/persona.ts` 와 `conversation.service.ts` 에 흩어져 있었고, 조립 순서도
 * 정체성이 두 조각으로 쪼개져 데이터 사이에 끼는 모양이었다. 문구 하나 고치려면 두 파일을 오가야 했고
 * "무엇이 몇 번째로 들어가는지"를 읽어낼 수 없었다. 그래서 텍스트와 순서를 여기로 모은다.
 *
 * 나누는 축은 **"턴마다 바뀌느냐"** 다:
 *  - `system`  — 페르소나·규칙. 대화 내내 그대로다.
 *  - `context` — 메모리·재고·금지 재료. 매 턴 달라진다.
 *
 * 지금은 둘을 이어 붙여 쓰지만, 이 경계가 나중에 **프롬프트 캐싱**의 절단선이 된다
 * (정적 부분을 프리픽스에 두고 동적 부분을 꼬리로 보내면 캐시가 산다). 새 블록을 넣을 때
 * "이건 턴마다 바뀌나?"만 답하면 자리가 정해지도록 의도한 구조다.
 *
 * Nest·DB·LLM 을 모르는 순수 모듈이라 `conversation.prompt.spec.ts` 로 전부 고정된다.
 */

import type { RecalledIngredient } from '../inventory/inventory.service';
import type { LlmInputItemType } from '../llm/llm-provider.interface';
import type { RecalledMemory } from '../memory/memory.service';

// ─────────────────────────────── 정적 문구 (system) ───────────────────────────────

// 조언자 정체성 — 캐릭터의 뿌리. 롤플레이(연인/성별 등) 대신 "내 냉장고를 아는 요리 조력자"로 고정한다.
// 이 문장이 앞단 자기소개를 대신하므로, 모델이 자기를 'AI/비서'로 소개하지 않고 이 역할로 자연스럽게 반응한다.
const ADVISOR_IDENTITY =
  '너는 자취하는 사용자의 냉장고를 함께 관리하고 뭘 해먹을지 같이 정해주는 든든한 조력자야. 사용자를 잘 아는 가까운 사람처럼 편하게 대하고, 사용자의 식성·재고를 기억해 지금 만들 수 있는 걸 함께 찾아줘.';

const SPEECH_INSTRUCTION: Record<string, string> = {
  casual: '대화는 항상 반말로, 편하고 친근하게 해.',
  formal: '대화는 항상 존댓말로, 정중하게 해.',
};

// 이 앱의 핵심(능동적 구조화 질문)을 여기서 인코딩한다.
// "답만 뱉지 말고 부족한 조건을 되물어 구조화한다"가 ChatGPT 래퍼와 갈리는 지점이다.
// 다만 마찰을 줄이려 적응형으로 — 최소 조건만 채워지면 진행하고, 이미 아는 건 다시 묻지 않는다.
const CONVERSATION_RULES = [
  '# 대화 규칙',
  '- 뭘 해먹을지 얘기가 나오면, 곧바로 답을 주기 전에 좋은 추천에 필요한 핵심 조건을 먼저 확인해. 보통 몇 인분인지, 시간을 얼마나 들일 수 있는지, 오늘 뭐가 당기는지야.',
  '- 이미 알고 있는 정보(식성·알레르기·조리도구·냉장고 재고)는 다시 묻지 마. 비어 있는 핵심 조건만 물어봐.',
  '- 질문은 한 번에 하나씩, 자연스럽게 해. 핵심 2~3개면 충분하고 그 이상 캐묻지 마.',
  '- 사용자가 "아무거나", "그냥 추천해줘"라고 하거나 조건을 이미 충분히 줬으면, 더 묻지 말고 바로 추천으로 넘어가.',
  '- 추천 직전엔 모은 조건을 한 줄로 짧게 되짚어 확인해. (예: "1인분, 20분 안에, 안 매운 걸로 볼게")',
  '- 잡담이나 요리와 무관한 얘기엔 조건을 캐묻지 말고 편하게 대화해.',
].join('\n');

// 요리 추천과 기본 조리법은 **모델 내장 지식**이 하고, 자세한 레시피 글은 search_recipes 가 찾아온다.
// 그 경계를 여기서 못박는다 — 안 그러면 모델이 매번 검색하려 들거나(쿼터), 아예 안 부른다.
const RECIPE_GUIDANCE = [
  '# 요리를 추천할 때',
  '- 냉장고에 있는 재료로 만들 수 있는 걸 우선 제안해라. 없는 재료를 잔뜩 사야 하는 요리는 피해라.',
  '- 곧 상하는 재료가 있으면 그걸 쓰는 요리를 먼저 권하고, 왜 권하는지 한마디로 짚어라. (예: "대파가 내일까지라 이거 먼저 쓰자") 단, 먹으면 안 되는 재료는 아무리 급해도 예외다.',
  '- 부족한 재료가 있으면 숨기지 말고 "○○만 있으면 돼" 처럼 솔직히 말해라.',
  '- 조리법은 핵심 순서만 짧게. 사용자가 더 물으면 그때 자세히 풀어라.',
  '- 사용자가 못 먹는 재료·알레르기는 절대 넣지 마라. 대체 재료를 제안해라.',
  '- 재료를 추천했다고 소비 처리하지 마라. 실제로 만들었다고 할 때만 update_inventory 의 consume 으로 처리해라.',
  '',
  '# 자세한 레시피를 찾아줄 때',
  '- 기본 조리법은 네가 직접 설명해라. 사용자가 "자세한 레시피", "만드는 법 더", "레시피 찾아줘"처럼 더 구체적인 걸 원할 때만 search_recipes 를 불러라.',
  '- 뭘 해먹을지 정하는 단계에서는 부르지 마라. 요리가 정해진 뒤에 부르는 도구다.',
  '- 먹으면 안 되는 재료 때문에 거절한 요리는 검색하지도 마라.',
  '- 검색 결과는 카드로 따로 보여진다. 글 제목·링크·출처를 문장에 나열하지 말고, "아래에서 자세한 레시피를 볼 수 있어" 정도로만 짚어라.',
  '- 카드는 네가 답을 쓴 뒤에 붙으므로, 어떤 글이 나왔는지 미리 아는 것처럼 말하지 마라.',
].join('\n');

// 가드레일 — 비서/AI 말투를 막고(몰입 유지), 위험 요청은 짧게 거절·전환하게 한다.
const GUARDRAILS = [
  '# 하지 말 것',
  '- "저는 AI라서" 같은 면책이나 상담원·비서 말투 금지. 이건 꼭 지켜.',
  '- 대화 요약, 부탁하지 않은 목록이나 장문 금지.',
  '- 위험하거나 불법인 요청은 짧게 거절하고, 훈계 없이 자연스럽게 화제를 돌려.',
].join('\n');

// ─────────────────────────────── 입출력 타입 ───────────────────────────────

/** 프롬프트에 쓰는 캐릭터 필드 — 저장된 instruction 이 아니라 **구조화 필드**를 받는다. */
export type PromptCharacterType = {
  name: string;
  speechStyle?: string | null;
  userNickname?: string | null;
};

export type PromptContextType = {
  character: PromptCharacterType;
  /** 캐릭터 소유 유저 이름 — "나를 아는" 느낌을 준다 (없을 수 있음) */
  userName: string | null;
  memories: RecalledMemory[];
  inventory: RecalledIngredient[];
  /** 남은 일수 계산 기준 시각 (테스트에서 고정) */
  now?: Date;
};

export type BuiltPromptType = {
  /** 대화 내내 그대로인 부분 — 페르소나 + 규칙 */
  system: string;
  /** 매 턴 달라지는 부분 — 메모리 + 재고 + 금지 재료 */
  context: string;
};

const joinBlocks = (blocks: string[]) => blocks.filter((b) => b.trim().length > 0).join('\n\n');

// ─────────────────────────────── 블록들 ───────────────────────────────

/**
 * 정체성 한 덩어리 — 이름·역할·상대 이름·말투·호칭.
 * 예전엔 "너의 이름은 X야"(conversation)와 역할 문장(persona)이 갈라져 데이터 블록을 사이에 두고
 * 떨어져 있었다. 모델이 자기를 규정하는 문장들이라 붙여 두는 게 맞다.
 */
export function identityBlock(c: PromptCharacterType, userName: string | null): string {
  const lines = [`너의 이름은 ${c.name}이야.`, ADVISOR_IDENTITY];
  if (userName) lines.push(`대화 상대(사용자)의 이름은 ${userName}이야.`);
  const speech = c.speechStyle ? SPEECH_INSTRUCTION[c.speechStyle] : undefined;
  if (speech) lines.push(speech);
  if (c.userNickname?.trim()) lines.push(`사용자를 '${c.userNickname.trim()}'라고 불러.`);
  return lines.join('\n');
}

/** 장기 메모리(알레르기 제외) — 비면 섹션 자체가 안 붙는다. */
export function memoriesBlock(memories: RecalledMemory[]): string {
  if (memories.length === 0) return '';
  const facts = memories.map((m) => `- ${m.content}`).join('\n');
  return `# 사용자에 대해 기억하는 것\n${facts}`;
}

/** 금지 재료 블록 — 없으면 빈 문자열(섹션 자체가 안 붙는다). content 가 이름뿐이라 목록이 짧고 선명하다. */
export function formatAllergyWarning(allergies: RecalledMemory[]): string {
  if (allergies.length === 0) return '';
  const items = allergies.map((m) => `- ${m.content}`).join('\n');
  return [
    '# ⚠️ 무엇보다 우선하는 규칙 — 먹으면 안 되는 것',
    items,
    '- 이 재료가 들어가는 요리는 **절대 추천하지 마라.** 사용자가 직접 그 요리를 만들어 달라고 해도 거절하고 다른 걸 제안해라.',
    '- 분류로 적혀 있으면 거기 속하는 재료도 전부 금지다. (갑각류 → 새우·게·랍스터, 유제품 → 우유·치즈·버터, 견과류 → 아몬드·호두)',
    '- 냉장고에 있어도, 심지어 곧 상해도 쓰지 마라. **"임박한 재료 먼저"보다 이 규칙이 우선이다.**',
    '- 레시피를 내놓기 전에 재료 목록을 다시 훑어 금지 재료가 없는지 확인해라.',
  ].join('\n');
}

/**
 * 먹으면 안 되는 것을 나머지 기억과 분리한다 — **카테고리로만** 판정한다.
 *
 * 예전엔 content 를 정규식(`/알레르기|못 먹|.../`)으로 훑어 골라냈다. 안전 판별을 문자열 추측에
 * 맡기는 구조였고, 부정문("우유 알레르기는 없음")을 구분하지 못해 없던 금지를 만들어내기도 했다.
 * 지금은 `ALLERGY` 카테고리가 그 역할을 하고, content 에는 재료 이름만 들어온다.
 *
 * ⚠️ 카테고리는 추출 LLM 이 고른다 — 오분류하면 그 항목은 금지 목록에서 빠진다.
 * 그래서 추출 프롬프트가 ALLERGY 의 경계를 명시적으로 못박고 있다(`memory.prompt.ts`).
 */
export function splitAllergies(memories: RecalledMemory[]): {
  allergies: RecalledMemory[];
  rest: RecalledMemory[];
} {
  const allergies: RecalledMemory[] = [];
  const rest: RecalledMemory[] = [];
  for (const m of memories) {
    (m.category === 'ALLERGY' ? allergies : rest).push(m);
  }
  return { allergies, rest };
}

/** 자정 기준 남은 일수 — 시:분 차이로 "0일 남음/1일 남음"이 흔들리지 않게 날짜만 비교한다. */
export function daysLeft(expiresAt: Date, now: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(expiresAt) - startOfDay(now)) / 86_400_000);
}

/**
 * 재고 → 프롬프트 블록. **재고 정보만** 담는다(무엇이 있고 언제까지인지).
 * 비어 있으면 "비었다"고 명시해야 모델이 재료를 지어내지 않는다.
 *
 * 남은 일수를 **서버가 계산해서** 넣는 게 중요하다: 모델은 오늘 날짜를 모르거나 틀리게 알고 있어서
 * 날짜만 주면 "곧 상해요" 판단을 못 한다. 조회 툴이 따로 필요 없어지는 것도 이 주입 덕분이다.
 *
 * 금지 재료 표시는 여기 넣지 않는다 — 이름 부분일치로 판정하던 방식이라 "김"이 "김치를 못 먹음"에
 * 걸리는 오탐이 있었고, 반대로 "갑각류"는 "새우"를 못 잡았다. 금지는 바로 다음에 오는 전용 블록이 맡는다.
 */
export function formatInventory(inventory: RecalledIngredient[], now = new Date()): string {
  if (inventory.length === 0) {
    return '냉장고: 아직 등록된 재료가 없어. 있는 재료를 물어보고 update_inventory 의 add 로 넣어줘.';
  }

  const lines = inventory.map((i) => {
    const left = daysLeft(i.expiresAt, now);
    const when =
      left < 0
        ? `${Math.abs(left)}일 지남`
        : left === 0
          ? '오늘까지'
          : left === 1
            ? '내일까지'
            : `${left}일 남음`;
    const qty = i.quantityNote ? ` (${i.quantityNote})` : '';
    // 사용자가 표기일을 준 게 아니면 추정치임을 밝힌다 — 모델이 단정적으로 말하지 않게.
    const hedge = i.expirySource === 'ESTIMATED' ? ' (추정)' : '';
    return `- ${i.name}${qty} · ${when}${hedge}`;
  });
  return `# 지금 냉장고에 있는 재료 (임박순)\n${lines.join('\n')}`;
}

// ─────────────────────────────── 조립 ───────────────────────────────

/**
 * 최종 프롬프트 조립 — **순서는 아래 두 배열이 전부다.**
 *
 * 금지 재료는 반드시 **맨 마지막**이다. 중간에 두면 "곧 상하는 재료부터 쓰라"는 지침에 밀린다 —
 * 실제로 알레르기 재료가 가장 임박했을 때 모델이 그걸 1순위로 추천하는 걸 확인했다.
 * 순서를 바꿀 땐 `conversation.prompt.spec.ts` 의 순서 테스트가 함께 지켜준다.
 */
/**
 * `context` 를 감싸는 라벨.
 *
 * context 는 user 메시지 안에 실려 나가는데, 출처를 밝히지 않으면 모델이 **사용자가 재고 목록을
 * 타이핑했다**고 읽는다("네가 말한 재고를 보니…" 같은 반향). 두 라벨로 시스템 주입분과
 * 사용자가 실제로 친 말을 갈라 준다.
 */
const CONTEXT_HEADER = '[현재 상태 — 시스템이 붙인 정보이며 사용자가 입력한 것이 아니다]';
const USER_MESSAGE_HEADER = '[사용자 메시지]';

/**
 * 보낼 아이템 목록의 **마지막 사용자 메시지에만** context 를 덧씌운다.
 *
 * DB 에는 사용자가 친 원문만 저장하고, 이 함수는 **요청을 조립할 때만** 상태를 붙인다.
 * 지난 user 메시지를 건드리지 않는 게 핵심이다 — 옛 재고가 히스토리에 남으면 모델이 지금 상태와
 * 헷갈리고, 턴마다 앞부분이 달라져 프리픽스 캐시도 죽는다.
 *
 * 원본 배열·아이템은 변형하지 않는다(새 배열 반환).
 */
export function attachContext(items: LlmInputItemType[], context: string): LlmInputItemType[] {
  const body = context.trim();
  if (body.length === 0) return items;

  // 뒤에서부터 첫 user 텍스트를 찾는다 (findLastIndex 는 런타임 지원이 갈려 직접 순회).
  let target: number | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === 'text' && item.role === 'user') {
      target = i;
      break;
    }
  }

  // 사용자 메시지가 하나도 없으면(정상 흐름에선 안 생김) 상태를 잃지 않게 아이템으로 덧붙인다.
  if (typeof target === 'undefined') {
    return [...items, { type: 'text', role: 'user', content: `${CONTEXT_HEADER}\n${body}` }];
  }

  return items.map((item, i) =>
    i === target && item.type === 'text'
      ? {
          ...item,
          content: `${CONTEXT_HEADER}\n${body}\n\n${USER_MESSAGE_HEADER}\n${item.content}`,
        }
      : item,
  );
}

export function buildPrompt(ctx: PromptContextType): BuiltPromptType {
  const { allergies, rest } = splitAllergies(ctx.memories);

  const system = joinBlocks([
    identityBlock(ctx.character, ctx.userName),
    CONVERSATION_RULES,
    RECIPE_GUIDANCE,
    GUARDRAILS,
  ]);

  const context = joinBlocks([
    memoriesBlock(rest),
    formatInventory(ctx.inventory, ctx.now ?? new Date()),
    formatAllergyWarning(allergies), // ← 반드시 맨 끝 (재고 바로 다음)
  ]);

  return { system, context };
}
