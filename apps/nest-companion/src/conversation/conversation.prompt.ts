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
const ADVISOR_IDENTITY = [
  '너는 사용자의 냉장고를 함께 관리하고, 지금 있는 재료와 사용자의 취향을 바탕으로 무엇을 먹을지 같이 정해주는 요리 조력자야.',
  '자연스럽게 대화하면서 뭘 먹을지 함께 정하고, 정해진 요리의 기본 조리법을 알려주고, 사용자가 원하면 도구로 자세한 레시피를 찾아줘.',
].join('\n');

/** 말투 설정값 → 사람이 읽는 라벨. `# 사용자 정보` 블록에 값으로 들어간다. */
const SPEECH_LABEL: Record<string, string> = {
  casual: '반말',
  formal: '존댓말',
};

// 이 앱의 핵심(능동적 구조화 질문)을 여기서 인코딩한다.
// "답만 뱉지 말고 부족한 조건을 되물어 구조화한다"가 ChatGPT 래퍼와 갈리는 지점이라
// **첫 줄이 "먼저 확인해라"** 인 게 의도다(순서를 뒤집으면 모델이 눈에 띄게 덜 묻는다).
// 다만 마찰을 줄이려 적응형으로 — 최소 조건만 채워지면 진행하고, 이미 아는 건 다시 묻지 않는다.
const CONVERSATION_RULES = [
  '# 대화 규칙',
  '- 뭘 해먹을지 얘기가 나오면, 곧바로 답을 주기 전에 좋은 추천에 필요한 핵심 조건을 먼저 확인해.',
  '- 이미 알고 있는 정보(식성·못 먹는 것·조리도구·냉장고 재고)는 다시 묻지 마. 비어 있는 핵심 조건만 물어봐.',
  '- 질문은 한 번에 하나씩, 자연스럽게 해. 핵심 2~3개면 충분하고 그 이상 캐묻지 마.',
  '- 사용자가 "아무거나", "그냥 추천해줘"라고 하거나 조건을 이미 충분히 줬으면, 더 묻지 말고 바로 추천으로 넘어가.',
  '- 잡담이나 요리와 무관한 얘기엔 조건을 캐묻지 말고 편하게 대화해.',
  '- 부탁하지 않은 대화 요약이나 장문의 설명은 하지 마.',
].join('\n');

// 요리 추천의 우선순위.
//
// ⚠️ **"임박 재료 우선"이 1순위에서 내려왔다.** 유통기한은 이제 사용자가 넣기로 한 재료에만
// 있어서(미설정이 기본), 대부분의 목록에는 날짜가 없다. 그 상태에서 "임박한 것부터"를 강하게
// 시키면 모델이 지킬 수 없는 지시를 받고 **날짜를 지어내서라도 따르려 한다.**
// 그래서 날짜가 있는 재료가 실제로 임박했을 때만 참고하는 정도로 낮췄다.
const RECIPE_GUIDANCE = [
  '# 요리 추천',
  '요리를 추천할 때 다음 우선순위를 따라.',
  '1. 냉장고에 있는 재료로 만들 수 있는 요리',
  '2. 그래도 마땅치 않으면, 추가로 사야 할 재료가 가장 적은 요리',
  '',
  '- 유통기한은 **적혀 있는 재료에만** 있다. 날짜가 적힌 재료 중 곧 상하는 게 있으면 그걸 쓰는 요리를 권하면서 이유를 한마디로 짚어. (예: "대파가 내일까지라 이거 먼저 쓰자")',
  '- 날짜가 안 적힌 재료는 **언제까지인지 모르는 것**이다. 상했는지 아닌지 넘겨짚지 말고, 유통기한을 지어내지도 마.',
  '- 부족한 재료가 있으면 숨기지 말고 "○○만 있으면 돼" 처럼 솔직히 말해.',
  '- 먹으면 안 되는 재료가 들어가는 요리는 **먼저 추천하지 마.** 유통기한이 임박했어도 마찬가지고, 대체 재료가 있으면 그걸 제안해.',
  '- 추천에 필요한 조건이 부족하면 이것부터 확인해 — 어떤 음식·맛이 당기는지 / 몇 인분인지 / 얼마나 빨리 만들어야 하는지.',
  '- 추천 직전엔 모은 조건을 한 줄로 짧게 되짚어 확인해. (예: "1인분, 20분 안에, 안 매운 걸로 볼게")',
].join('\n');

// 요리가 정해진 뒤의 흐름. 여기서 search_recipes 로 넘어가는 다리를 놓는다 —
// 예전엔 사용자가 먼저 "자세한 레시피 보여줘"라고 해야만 검색이 붙어서 기능이 거의 안 쓰였다.
const AFTER_PICK = [
  '# 요리가 정해지면',
  '- 사용자가 추천을 좋다고 하거나 직접 고르면 그 요리로 정해진 걸로 봐.',
  '- 재료와 조리법은 **카드로 보여줘**(propose_dish). 같은 내용을 말로 다시 늘어놓지 마.',
  '- 말로는 한마디만 곁들여 — 왜 이 요리인지, 뭘 더 사야 하는지 같은 것. (예: "대파가 내일까지라 이거 먼저 쓰자. 두부만 사면 돼!")',
  '- 그다음 자세한 레시피를 검색해서 찾아줄지 물어봐.',
].join('\n');

// 재고를 함부로 건드리지 않게 하는 규칙. 자동 차감 방지가 방침이라 여기서 못박는다.
const INVENTORY_RULES = [
  '# 재고 관리',
  '- 추천하거나 언급하는 것만으로 재고를 바꾸지 마. 사용자가 실제로 만들었거나 다 썼다고 말했을 때만 소비로 처리해.',
  '- 재고 목록에 없는 재료를 사용자가 갖고 있다고 하면, 소비가 아니라 새로 넣는 것으로 처리해.',
  '- 재료 이름은 재고 목록에 적힌 이름을 그대로 써. 같은 재료를 다르게 부르면 별개 재료로 쌓인다.',
].join('\n');

// 툴을 언제·어떻게 부를지는 각 툴 description 이 소유한다(중복해서 적으면 두 곳이 어긋난다).
const TOOL_RULES = [
  '# 도구 사용',
  '- 도구는 필요할 때만 불러. 각 도구를 언제 어떻게 부를지는 그 도구의 설명을 따라.',
  '- 부를 이유가 없으면 부르지 마.',
].join('\n');

// 가드레일 — 위험 요청은 짧게 거절·전환하게 한다.
const GUARDRAILS = [
  '# 금지사항',
  '- 상담원이나 비서처럼 딱딱하게 말하지 마.',
  '- 사용자가 알려주지 않은 정보를 지어내지 마.',
  '- 위험하거나 불법인 요청은 짧게 거절하고, 훈계 없이 자연스럽게 화제를 돌려.',
].join('\n');

// ─────────────────────────────── 입출력 타입 ───────────────────────────────

/** 프롬프트에 쓰는 캐릭터 필드 — 저장된 instruction 이 아니라 **구조화 필드**를 받는다. */
export type PromptCharacterType = {
  name: string;
  speechStyle?: string | null;
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
 * 받침 유무로 조사를 고른다 — "초코**야**" / "초콜릿**이야**".
 * 이름은 사용자가 직접 지은 값이라 항상 "이야"로 붙이면 자기 이름을 어색하게 말한다.
 * 한글이 아니면(영문·숫자) 받침 없는 쪽으로 본다.
 */
function withNameParticle(name: string): string {
  const trimmed = name.trim();
  // 빈 문자열이면 NaN 이 나오고 아래 비교가 전부 false 라 '야' 로 떨어진다(정상 흐름엔 없음).
  const code = trimmed.charCodeAt(trimmed.length - 1);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  return `${name}${isHangul && (code - 0xac00) % 28 !== 0 ? '이야' : '야'}`;
}

/** 역할 — 자기가 누구이고 무엇을 하는지. 모델이 자기를 규정하는 문장이라 맨 앞에 온다. */
export function roleBlock(name: string): string {
  return ['# 역할', `너의 이름은 ${withNameParticle(name)}.`, ADVISOR_IDENTITY].join('\n');
}

/**
 * 사용자 정보 — 이름·말투를 **값으로** 준다.
 *
 * 둘 다 없을 수 있어서 있는 것만 렌더한다. 빈 줄("사용자 이름: ")이 나가면 모델이 빈 값을
 * 이름으로 착각하거나 지어낸다.
 *
 * 예전엔 `호칭`(캐릭터가 사용자를 부르는 말)이 따로 있었는데 걷어냈다 — 이름스러운 값이 셋이라
 * 유저가 헷갈렸고, 부를 말은 이름 하나면 된다.
 */
export function userBlock(userName: string | null, speechStyle: string | null = null): string {
  const name = userName?.trim();
  const speech = speechStyle ? SPEECH_LABEL[speechStyle] : undefined;

  const facts: string[] = [];
  if (name) facts.push(`사용자 이름: ${name}`);
  if (speech) facts.push(`말투: ${speech}`);
  if (facts.length === 0) return '';

  const rules: string[] = [];
  // ⚠️ 이름을 사실로만 주면 모델이 부르지 않고 넘어가는 경우가 있어 "부르라"고 명시한다.
  if (name) rules.push(`- 사용자를 부를 때는 '${name}' 이라고 불러.`);
  if (speech) rules.push(`- 대화는 항상 ${speech}로 해.`);

  return ['# 사용자 정보', ...facts, ...(rules.length > 0 ? ['', ...rules] : [])].join('\n');
}

/**
 * 조리도구(`OWNERSHIP`) — 비면 섹션 자체가 안 붙는다.
 *
 * 한 줄로 잇는 이유: 온보딩 태그로 들어오는 값이라 content 가 **도구 이름 하나**다("에어프라이어").
 * 이런 짧은 낱말을 줄바꿈 목록으로 펼치면 길이만 늘고 읽기는 나빠진다.
 */
export function equipmentBlock(items: RecalledMemory[]): string {
  if (items.length === 0) return '';
  return `# 요리 장비\n${items.map((m) => m.content).join(', ')}`;
}

/**
 * 사용자 특성(`PREFERENCE`·`PROFILE`·`ETC`) — 식성·체질·상황·요리 실력이 함께 온다.
 *
 * ⚠️ 조리도구·알레르기와 달리 **줄바꿈 목록을 유지한다.** 이쪽 content 는 추출 LLM 이 만든
 * 문장이라("우유를 많이 마시면 배가 아픔") 콤마로 이으면 어디서 한 항목이 끝나는지 흐려진다.
 */
export function traitsBlock(items: RecalledMemory[]): string {
  if (items.length === 0) return '';
  return `# 사용자 특성\n${items.map((m) => `- ${m.content}`).join('\n')}`;
}

/**
 * 먹으면 안 되는 것 블록 — 없으면 빈 문자열(섹션 자체가 안 붙는다). content 가 이름뿐이라 목록이 짧고 선명하다.
 *
 * **규칙이 두 겹이고 순서가 중요하다:** 먼저 "추천하지 마라"(강한 금지)를 두고, 그다음에
 * "사용자가 직접 하겠다면 막지 마라"(예외)를 둔다. 예외를 앞에 두면 모델이 금지 자체를 약하게 읽는다.
 *
 * ⚠️ 이 블록은 **추천을 막을 뿐 사용자의 선택을 막지 않는다.** 제품 방침이 그렇다 —
 * 우리가 먼저 권하지는 않되, 사용자가 직접 만들겠다고 하면 짧게 주의만 주고 도와준다.
 * system 의 `# 요리 추천` 에도 같은 정책이 적혀 있다. **한쪽만 고치면 두 지시가 모순돼
 * 모델이 아무거나 고르므로**(맨 끝에 오는 이 블록이 이길 가능성이 높다) 반드시 함께 고칠 것.
 */
export function formatAllergyWarning(allergies: RecalledMemory[]): string {
  if (allergies.length === 0) return '';
  // content 가 재료·분류 **이름뿐**이라(persona.ts 의 toMemory 가 문장으로 감싸지 않는다) 한 줄로 잇는다.
  const items = allergies.map((m) => m.content).join(', ');
  return [
    // ⚠️ 제목을 "알레르기"로만 줄이지 말 것 — 이 카테고리는 종교·비건처럼 알레르기가 아닌
    // "못 먹는 재료"도 담는다. system 의 `# 요리 추천` 도 "먹으면 안 되는 재료"라고 부르므로
    // 두 곳의 낱말이 같아야 모델이 규칙과 목록을 이어 읽는다.
    '# ⚠️ 알레르기·먹으면 안 되는 재료',
    items,
    '- 이 재료가 들어가는 요리는 먼저 추천하지 마라. "임박한 재료 먼저"보다 이 규칙이 우선이다.',
    '- 다만 사용자가 그 재료를 쓰거나 그 요리를 직접 만들겠다고 하면 막지 마라. **짧게 한 번만** 주의를 주고 그대로 도와줘라. 반복해서 경고하거나 훈계하지 마라.',
  ].join('\n');
}

/**
 * 기억을 프롬프트 섹션별로 가른다 — **카테고리로만** 판정한다.
 *
 * 예전엔 전부 "사용자에 대해 기억하는 것" 한 목록이라 조리도구("에어프라이어 있음")와 식성
 * ("매운 음식 좋아함")이 뒤섞였다. 모델 입장에서 **"뭘 가지고 있는지"와 "뭘 좋아하는지"는
 * 쓰임이 다른데**(전자는 조리법 가능 여부, 후자는 요리 선택) 한 덩어리면 구분해서 쓰기 어렵다.
 *
 * 알레르기 판정을 카테고리에 맡기는 건 안전 문제라 특히 중요하다. 예전엔 content 를
 * 정규식(`/알레르기|못 먹|.../`)으로 훑어 골라냈는데, 안전 판별을 문자열 추측에 맡기는 구조였고
 * 부정문("우유 알레르기는 없음")을 구분하지 못해 없던 금지를 만들어내기도 했다.
 *
 * ⚠️ 카테고리는 추출 LLM 이 고른다 — 오분류하면 그 항목은 금지 목록에서 빠진다.
 * 그래서 추출 프롬프트가 ALLERGY 의 경계를 명시적으로 못박고 있다(`memory.prompt.ts`).
 */
export function splitMemories(memories: RecalledMemory[]): {
  allergies: RecalledMemory[];
  equipment: RecalledMemory[];
  traits: RecalledMemory[];
} {
  const allergies: RecalledMemory[] = [];
  const equipment: RecalledMemory[] = [];
  const traits: RecalledMemory[] = [];
  for (const m of memories) {
    if (m.category === 'ALLERGY') allergies.push(m);
    else if (m.category === 'OWNERSHIP') equipment.push(m);
    // PREFERENCE(식성) · PROFILE(체질·상황·실력) · ETC 는 "이 사람은 어떤 사람인가"로 묶인다.
    else traits.push(m);
  }
  return { allergies, equipment, traits };
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
    const qty = i.quantityNote ? ` (${i.quantityNote})` : '';
    // 유통기한은 **사용자가 넣기로 한 재료에만** 있다(미설정이 기본). 없으면 그 자리를 아예 비운다 —
    // "미상" 같은 말을 넣으면 모델이 그걸 상태로 읽고 언급하기 시작한다.
    // ⚠️ 예전엔 추정치에 `(추정)` 을 붙였는데, 이제 서버가 추정하지 않으므로 붙일 것도 없다.
    if (!i.expiresAt) return `- ${i.name}${qty}`;

    const left = daysLeft(i.expiresAt, now);
    const when =
      left < 0
        ? `${Math.abs(left)}일 지남`
        : left === 0
          ? '오늘까지'
          : left === 1
            ? '내일까지'
            : `${left}일 남음`;
    return `- ${i.name}${qty} · ${when}`;
  });
  // "임박순"이라고 부르지 않는다 — 날짜가 있는 재료가 앞에 오긴 하지만 대부분은 날짜가 없어서,
  // 그렇게 이름 붙이면 모델이 뒤쪽 재료를 "덜 급한 것"으로 읽는다. 실제로는 모르는 것이다.
  return `# 냉장고 재고\n${lines.join('\n')}\n(날짜가 적힌 재료만 유통기한을 아는 것이고, 나머지는 모른다)`;
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
  const { allergies, equipment, traits } = splitMemories(ctx.memories);

  const system = joinBlocks([
    roleBlock(ctx.character.name),
    userBlock(ctx.userName, ctx.character.speechStyle),
    CONVERSATION_RULES,
    RECIPE_GUIDANCE,
    AFTER_PICK,
    INVENTORY_RULES,
    TOOL_RULES,
    GUARDRAILS,
  ]);

  const context = joinBlocks([
    equipmentBlock(equipment), // 무엇으로 만들 수 있는가
    traitsBlock(traits), // 어떤 사람인가
    formatInventory(ctx.inventory, ctx.now ?? new Date()), // 무엇이 있는가
    formatAllergyWarning(allergies), // ← 반드시 맨 끝 (재고 바로 다음)
  ]);

  return { system, context };
}
