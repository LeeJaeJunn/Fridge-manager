/**
 * 캐릭터 페르소나 — 선택지 vocab + 시스템 프롬프트(instruction) 조립.
 *
 * 캐릭터는 "조언자 톤"의 얇은 페르소나로 축소됐다(제품 방향: 의사결정 컴패니언, 루트 README).
 * 유저가 정하는 건 **이름·말투·호칭**뿐이고, 정체성(조언자)은 고정이다.
 *
 * ⚠️ instruction 은 **저장하지 않는다**. Character 의 구조화 필드에서 프롬프트 시점에
 * `buildPersonaInstruction` 으로 매번 조립한다(단일 진실원천 — 템플릿을 고치면 기존 캐릭터도 자동 반영).
 *
 * 선택지 vocab(말투/관심사)과 입력 제한값(LIMITS)은 **서버 소유**다. native 는
 * `GET /characters/options` 로 이 목록·제한을 받아 칩을 렌더하고 입력을 미리 막는다
 * (@companion/types 는 타입만 실어 런타임 엔트리가 없어 값을 import 하면 부팅이 깨진다 —
 * 그래서 값은 코드가 아니라 API 로 내려준다). DTO 검증(@IsIn/@MaxLength)도 같은 값을 쓴다.
 */

import type { CharacterLimitsType, CharacterOptionsType } from '@companion/types';

export type OptionType = { value: string; label: string };

// NOTE: value 를 문자열-리터럴 유니온으로 좁히지 않으려고 `OptionType[]` 로 명시한다(`as const` 아님).
// 좁히면 labelOf 의 `o.value === value` 가 리터럴 유니온 비교가 되어 typescript-eslint 의
// no-unsafe-enum-comparison 규칙이 크래시한다(값은 어차피 String 컬럼이라 좁힐 이유도 없음).

/** 말투 — 반말/존댓말. */
export const SPEECH_STYLES: OptionType[] = [
  { value: 'casual', label: '반말' },
  { value: 'formal', label: '존댓말' },
];

/**
 * 온보딩 태그 그룹 — 캐릭터가 아니라 **유저 정보**라 생성 시 Memory row 로 시드된다.
 *
 * 그룹마다 들어가는 메모리 카테고리와 중요도가 다르다. 특히 알레르기는 `importance: 3` 인데,
 * 이건 정렬 취향이 아니라 **안전 문제**다 — 모델이 놓치면 사람이 다친다.
 * 대화로도 쌓이지만, 첫 레시피를 추천하기 전에 이미 알고 있어야 해서 온보딩에서 먼저 받는다.
 */
type TagGroup = {
  key: string;
  label: string;
  hint: string;
  options: string[];
  category: 'PREFERENCE' | 'PROFILE' | 'OWNERSHIP';
  importance: number;
  /** 선택값 → 저장할 기억 문장 */
  toMemory: (value: string) => string;
};

export const TAG_GROUPS: TagGroup[] = [
  {
    key: 'taste',
    label: '식성',
    hint: '레시피 추천에 반영할게',
    options: [
      '매운 음식 좋아함',
      '단 음식 좋아함',
      '느끼한 음식 싫어함',
      '채식 위주',
      '저염식 선호',
      '해산물 좋아함',
      '향신료 싫어함',
      '가벼운 식사 선호',
    ],
    category: 'PREFERENCE',
    importance: 2,
    toMemory: (v) => v, // 값 자체가 이미 문장
  },
  {
    key: 'allergy',
    label: '알레르기·못 먹는 것',
    hint: '이건 절대 추천하지 않을게',
    options: ['갑각류', '견과류', '땅콩', '유제품', '계란', '밀(글루텐)', '메밀', '복숭아', '오이'],
    category: 'PROFILE',
    importance: 3, // 안전 — 절대 묻히면 안 된다
    toMemory: (v) => `${v} 알레르기가 있음(먹으면 안 됨)`,
  },
  {
    key: 'appliance',
    label: '조리도구',
    hint: '있는 도구로 만들 수 있는 걸 추천할게',
    options: ['전자레인지', '에어프라이어', '인덕션', '가스레인지', '오븐', '밥솥', '냄비만 있음'],
    category: 'OWNERSHIP',
    importance: 2,
    toMemory: (v) => `${v} 있음`,
  },
];

/** DTO @IsIn 검증용 값 배열 */
export const SPEECH_STYLE_VALUES = SPEECH_STYLES.map((o) => o.value);
export const TAG_VALUES = TAG_GROUPS.flatMap((g) => g.options);

/**
 * 선택한 태그 → 저장할 메모리(카테고리·중요도 포함). 모르는 값이면 null.
 * DTO 가 @IsIn 으로 이미 거르지만, 값이 바뀌었을 때 조용히 잘못된 카테고리로 새지 않게 여기서도 확인한다.
 */
export function tagToMemory(value: string): {
  category: 'PREFERENCE' | 'PROFILE' | 'OWNERSHIP';
  content: string;
  importance: number;
} | null {
  const group = TAG_GROUPS.find((g) => g.options.includes(value));
  if (!group) return null;
  return {
    category: group.category,
    content: group.toMemory(value),
    importance: group.importance,
  };
}

/**
 * 입력 제한값 — **여기가 숫자의 유일한 출처**다.
 * 서버는 DTO 데코레이터(@MaxLength 등)로 이 값을 강제하고,
 * 클라는 `GET /characters/options` 로 같은 값을 받아 입력을 미리 막는다.
 * 숫자를 고칠 땐 여기만 고치면 양쪽이 함께 바뀐다.
 */
export const LIMITS: CharacterLimitsType = {
  nameMax: 30,
  userNicknameMax: 20,
};

/** `GET /characters/options` 응답 — native 폼이 렌더할 선택지 + 입력 제한 (표시용, 서버 소유). */
export function characterOptions(): CharacterOptionsType {
  return {
    speechStyles: SPEECH_STYLES.map((o) => ({ ...o })),
    // 어떤 카테고리로 시드되는지(category/importance)는 서버 내부 사정이라 내려주지 않는다.
    tagGroups: TAG_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      hint: g.hint,
      options: [...g.options],
    })),
    limits: { ...LIMITS },
  };
}

export type PersonaInput = {
  name: string;
  speechStyle?: string | null;
  userNickname?: string | null;
};

const SPEECH_INSTRUCTION: Record<string, string> = {
  casual: '대화는 항상 반말로, 편하고 친근하게 해.',
  formal: '대화는 항상 존댓말로, 정중하게 해.',
};

// 조언자 정체성 — 캐릭터의 뿌리. 롤플레이(연인/성별 등) 대신 "내 냉장고를 아는 요리 조력자"로 고정한다.
// 이 문장이 앞단 자기소개를 대신하므로, 모델이 자기를 'AI/비서'로 소개하지 않고 이 역할로 자연스럽게 반응한다.
const ADVISOR_IDENTITY =
  '너는 자취하는 사용자의 냉장고를 함께 관리하고 뭘 해먹을지 같이 정해주는 든든한 조력자야. 사용자를 잘 아는 가까운 사람처럼 편하게 대하고, 사용자의 식성·재고를 기억해 지금 만들 수 있는 걸 함께 찾아줘.';

// 모든 캐릭터 공통 규칙 — 항상 붙는다. 이 앱의 핵심(능동적 구조화 질문)을 여기서 인코딩한다.
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

// 가드레일 — 비서/AI 말투를 막고(몰입 유지), 위험 요청은 짧게 거절·전환하게 한다.
const GUARDRAILS = [
  '# 하지 말 것',
  '- "저는 AI라서" 같은 면책이나 상담원·비서 말투 금지. 이건 꼭 지켜.',
  '- 대화 요약, 부탁하지 않은 목록이나 장문 금지.',
  '- 위험하거나 불법인 요청은 짧게 거절하고, 훈계 없이 자연스럽게 화제를 돌려.',
].join('\n');

/**
 * 구조화 필드 → 캐릭터 시스템 프롬프트(캐릭터 성격 부분).
 * 정체성은 고정된 조언자 문장이 정하고, 뒤에 말투·호칭·공통 대화 규칙·가드레일을 섹션으로 붙인다.
 * 유저 이름·장기 메모리는 여기 넣지 않는다 — conversation 의 buildInstruction 이 앞단에서 조립한다.
 */
export function buildPersonaInstruction(c: PersonaInput): string {
  const persona: string[] = [ADVISOR_IDENTITY];

  const speech = c.speechStyle ? SPEECH_INSTRUCTION[c.speechStyle] : undefined;
  if (speech) persona.push(speech);

  if (c.userNickname?.trim()) {
    persona.push(`사용자를 '${c.userNickname.trim()}'라고 불러.`);
  }

  // 블록 조립: 정체성·말투·호칭 → 공통 규칙 → 가드레일.
  return [persona.join('\n'), CONVERSATION_RULES, GUARDRAILS].join('\n\n');
}
