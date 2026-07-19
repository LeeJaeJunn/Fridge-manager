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

/** 말투 — 반말/존댓말/반존대. */
export const SPEECH_STYLES: OptionType[] = [
  { value: 'casual', label: '반말' },
  { value: 'formal', label: '존댓말' },
  { value: 'semiformal', label: '반존대' },
];

/** 유저 관심사(선택형, 다중). 캐릭터가 아니라 유저 취향 → Memory(INTEREST) 로 시드된다. */
export const INTEREST_OPTIONS = [
  '여행',
  '음악',
  '독서',
  '영화',
  '요리',
  '운동',
  '게임',
  '패션',
  '반려동물',
  '자기계발',
] as const;

/** DTO @IsIn 검증용 값 배열 */
export const SPEECH_STYLE_VALUES = SPEECH_STYLES.map((o) => o.value);
export const INTEREST_VALUES = [...INTEREST_OPTIONS];

/**
 * 입력 제한값 — **여기가 숫자의 유일한 출처**다.
 * 서버는 DTO 데코레이터(@MaxLength 등)로 이 값을 강제하고,
 * 클라는 `GET /characters/options` 로 같은 값을 받아 입력을 미리 막는다.
 * 숫자를 고칠 땐 여기만 고치면 양쪽이 함께 바뀐다.
 */
export const LIMITS: CharacterLimitsType = {
  nameMax: 30,
  userNicknameMax: 20,
  interestsMax: 10,
};

/** `GET /characters/options` 응답 — native 폼이 렌더할 선택지 + 입력 제한 (표시용, 서버 소유). */
export function characterOptions(): CharacterOptionsType {
  return {
    speechStyles: SPEECH_STYLES.map((o) => ({ ...o })),
    interests: [...INTEREST_OPTIONS],
    limits: { ...LIMITS },
  };
}

/** 관심사 하나 → 시드할 Memory content 문장. */
export const interestToMemoryContent = (interest: string): string => `${interest}에 관심이 많음`;

export type PersonaInput = {
  name: string;
  speechStyle?: string | null;
  userNickname?: string | null;
};

const SPEECH_INSTRUCTION: Record<string, string> = {
  casual: '대화는 항상 반말로, 편하고 친근하게 해.',
  formal: '대화는 항상 존댓말로, 정중하게 해.',
  semiformal: '대화는 반말과 존댓말을 자연스럽게 섞은 반존대로 해.',
};

// 조언자 정체성 — 캐릭터의 뿌리. 롤플레이(연인/성별 등) 대신 "나를 잘 아는 의사결정 조력자"로 고정한다.
// 이 문장이 앞단 자기소개를 대신하므로, 모델이 자기를 'AI/비서'로 소개하지 않고 이 역할로 자연스럽게 반응한다.
const ADVISOR_IDENTITY =
  '너는 사용자의 의사결정을 돕는 든든한 조언자야. 사용자를 잘 아는 가까운 사람처럼 편하게 대하고, 사용자의 취향·상황을 기억해 가장 잘 맞는 선택을 함께 찾아줘.';

// 모든 캐릭터 공통 규칙 — 항상 붙는다(사람 같은 대화 톤의 핵심).
// 답변 길이·질문 수·미러링을 구체적으로 지시한다("너무 길지 않게" 같은 추상 표현보다 강하다).
const CONVERSATION_RULES = [
  '# 대화 규칙',
  '- 대화를 끊기게 하지 말고 자연스럽게 대답해. 너무 짧지 않게. 이게 제일 중요해.',
  '- 한 번에 질문은 하나만 해.',
  '- 먼저 공감하고 반응한 다음, 필요할 때만 제안을 하나 덧붙여.',
  '- 사용자의 기분에 맞춰서 대답해. 예를들어 신나면 같이 신나게 맞춰.',
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
