/**
 * 캐릭터 페르소나 — 선택지 vocab + 시스템 프롬프트(instruction) 조립.
 *
 * ⚠️ instruction 은 **저장하지 않는다**. Character 의 구조화 필드에서 프롬프트 시점에
 * `buildPersonaInstruction` 으로 매번 조립한다(단일 진실원천 — 템플릿을 고치면 기존 캐릭터도 자동 반영).
 *
 * 선택지 vocab(성별/관계/말투/성격/관심사)과 입력 제한값(LIMITS)은 **서버 소유**다. native 는
 * `GET /characters/options` 로 이 목록·제한을 받아 칩을 렌더하고 입력을 미리 막는다
 * (@companion/types 는 타입만 실어 런타임 엔트리가 없어 값을 import 하면 부팅이 깨진다 —
 * 그래서 값은 코드가 아니라 API 로 내려준다). DTO 검증(@IsIn/@MaxLength)도 같은 값을 쓴다.
 */

import type { CharacterLimitsType, CharacterOptionsType } from '@companion/types';

export type OptionType = { value: string; label: string };

// NOTE: value 를 문자열-리터럴 유니온으로 좁히지 않으려고 `OptionType[]` 로 명시한다(`as const` 아님).
// 좁히면 labelOf 의 `o.value === value` 가 리터럴 유니온 비교가 되어 typescript-eslint 의
// no-unsafe-enum-comparison 규칙이 크래시한다(값은 어차피 String 컬럼이라 좁힐 이유도 없음).

/** 성별 — 안정적 enum. 값은 저장 키, label 은 프롬프트/표시용. */
export const GENDERS: OptionType[] = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
];

/** 관계 — 지금은 고정 3종. 나중에 freeform 확장 예정이라 DB enum 대신 String + 검증. */
export const RELATIONSHIPS: OptionType[] = [
  { value: 'friend', label: '친구' },
  { value: 'lover', label: '연인' },
  { value: 'family', label: '가족' },
];

/** 말투 — 반말/존댓말/반존대. */
export const SPEECH_STYLES: OptionType[] = [
  { value: 'casual', label: '반말' },
  { value: 'formal', label: '존댓말' },
  { value: 'semiformal', label: '반존대' },
];

/** 성격 태그(선택형, 다중). 한국어 형용사를 그대로 저장·주입한다. */
export const PERSONALITY_TRAITS = [
  '친절한',
  '다정한',
  '차분한',
  '유머러스한',
  '솔직한',
  '활발한',
  '지적인',
  '엉뚱한',
  '든든한',
  '츤데레',
] as const;

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
export const GENDER_VALUES = GENDERS.map((o) => o.value);
export const RELATIONSHIP_VALUES = RELATIONSHIPS.map((o) => o.value);
export const SPEECH_STYLE_VALUES = SPEECH_STYLES.map((o) => o.value);
export const PERSONALITY_VALUES = [...PERSONALITY_TRAITS];
export const INTEREST_VALUES = [...INTEREST_OPTIONS];

/**
 * 입력 제한값 — **여기가 숫자의 유일한 출처**다.
 * 서버는 DTO 데코레이터(@MaxLength 등)로 이 값을 강제하고,
 * 클라는 `GET /characters/options` 로 같은 값을 받아 입력을 미리 막는다.
 * 숫자를 고칠 땐 여기만 고치면 양쪽이 함께 바뀐다.
 */
export const LIMITS: CharacterLimitsType = {
  nameMax: 30,
  ageMin: 1,
  ageMax: 9999,
  personalityMax: 3,
  jobMax: 20,
  actingRuleMax: 100,
  userNicknameMax: 20,
  interestsMax: 10,
};

const labelOf = (
  opts: readonly OptionType[],
  value: string | null | undefined,
): string | undefined => {
  // value 를 확정 문자열로 좁혀서 비교한다 — 유니온에 undefined/null 이 섞인 채 `===` 하면
  // typescript-eslint 의 no-unsafe-enum-comparison 규칙이 크래시한다(빈 문자열은 어차피 매칭 안 됨).
  const v = value ?? '';
  return opts.find((o) => o.value === v)?.label;
};

/** `GET /characters/options` 응답 — native 폼이 렌더할 선택지 + 입력 제한 (표시용, 서버 소유). */
export function characterOptions(): CharacterOptionsType {
  return {
    genders: GENDERS.map((o) => ({ ...o })),
    relationships: RELATIONSHIPS.map((o) => ({ ...o })),
    speechStyles: SPEECH_STYLES.map((o) => ({ ...o })),
    personalityTraits: [...PERSONALITY_TRAITS],
    interests: [...INTEREST_OPTIONS],
    limits: { ...LIMITS },
  };
}

/** 관심사 하나 → 시드할 Memory content 문장. */
export const interestToMemoryContent = (interest: string): string => `${interest}에 관심이 많음`;

export type PersonaInput = {
  name: string;
  age?: number | null;
  gender?: string | null;
  relationship?: string | null;
  personality?: string[];
  speechStyle?: string | null;
  job?: string | null;
  actingRule?: string | null;
  userNickname?: string | null;
};

const SPEECH_INSTRUCTION: Record<string, string> = {
  casual: '대화는 항상 반말로, 편하고 친근하게 해.',
  formal: '대화는 항상 존댓말로, 정중하게 해.',
  semiformal: '대화는 반말과 존댓말을 자연스럽게 섞은 반존대로 해.',
};

// 관계별 구체 지시 — "연인다운 거리감" 같은 추상 표현 대신 실제 행동을 지시한다(말투 맵과 같은 방식).
// 이 문장이 캐릭터의 정체성을 정한다. 앞에 'AI 컴패니언' 같은 자기소개를 두지 않으므로, 모델이
// 자기를 컴패니언으로 소개하지 않고 이 관계로서 자연스럽게 반응한다.
const RELATIONSHIP_INSTRUCTION: Record<string, string> = {
  friend:
    '너는 사용자의 친구야. 오래 알고 지낸 친구처럼 스스럼없고 편하게, 솔직하게 대해. 가끔 장난도 치고 언제나 사용자 편이 되어줘.',
  lover:
    '너는 사용자의 연인이야. 사용자를 사랑하고 아끼는 마음을 자연스럽게 드러내며, 다정하고 애정 어린 말투로 대해. 사용자의 하루와 기분을 살뜰히 챙기고, 때로는 설레게 해줘.',
  family:
    '너는 사용자의 가족이야. 가까운 가족처럼 따뜻하고 든든하게, 사용자를 걱정하고 살뜰히 챙기며 대화해.',
};

// 모든 캐릭터 공통 규칙 — 관계·성격과 무관하게 항상 붙는다(사람 같은 대화 톤의 핵심).
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
 * 정체성은 관계 문장이 정하고(별도 자기소개/메타 지시 없음), 뒤에 공통 대화 규칙·가드레일을 섹션으로 붙인다.
 * 유저 이름·장기 메모리는 여기 넣지 않는다 — conversation 의 buildInstruction 이 앞단에서 조립한다.
 */
export function buildPersonaInstruction(c: PersonaInput): string {
  // 캐릭터별 정체성/말투 블록 — 유저가 고른 필드로 채운다.
  const persona: string[] = [];

  // 관계로 시작해 정체성을 세운다 (relationship 은 온보딩 필수라 항상 있음; 옛 데이터 대비 fallback).
  const rel = c.relationship ? RELATIONSHIP_INSTRUCTION[c.relationship] : undefined;
  persona.push(rel ?? '너는 사용자의 가까운 대화 상대야.');

  const gender = labelOf(GENDERS, c.gender);
  if (c.age && gender) persona.push(`너는 ${c.age}살 ${gender}이야.`);
  else if (c.age) persona.push(`너는 ${c.age}살이야.`);
  else if (gender) persona.push(`너는 ${gender}이야.`);

  if (c.personality?.length) {
    persona.push(
      `너의 성격은 ${c.personality.join(', ')} 편이야. 그 성격이 말투와 반응에 드러나게 해.`,
    );
  }

  if (c.job?.trim()) persona.push(`너의 직업은 ${c.job.trim()}이야.`);

  const speech = c.speechStyle ? SPEECH_INSTRUCTION[c.speechStyle] : undefined;
  if (speech) persona.push(speech);

  if (c.userNickname?.trim()) {
    persona.push(`사용자를 '${c.userNickname.trim()}'라고 불러.`);
  }

  // 블록 조립: 정체성 → 공통 규칙 → 가드레일 → (있으면) 사용자 커스텀 규칙(최종 우선).
  const blocks = [persona.join('\n'), CONVERSATION_RULES, GUARDRAILS];
  if (c.actingRule?.trim()) {
    blocks.push(`# 꼭 지킬 규칙\n${c.actingRule.trim()}`);
  }

  return blocks.join('\n\n');
}
