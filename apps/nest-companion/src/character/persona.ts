/**
 * 캐릭터 페르소나 — 선택지 vocab + 시스템 프롬프트(instruction) 조립.
 *
 * 캐릭터는 "조언자 톤"의 얇은 페르소나로 축소됐다(제품 방향: 의사결정 컴패니언, 루트 README).
 * 유저가 정하는 건 **이름·말투·호칭**뿐이고, 정체성(조언자)은 고정이다.
 *
 * ⚠️ instruction 은 **저장하지 않는다**. Character 의 구조화 필드에서 프롬프트 시점에
 * `conversation/conversation.prompt.ts` 의 `buildPrompt` 가 매번 조립한다
 * (단일 진실원천 — 템플릿을 고치면 기존 캐릭터도 자동 반영).
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
  category: 'ALLERGY' | 'PREFERENCE' | 'PROFILE' | 'OWNERSHIP';
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
    category: 'ALLERGY',
    importance: 3, // 안전 — 절대 묻히면 안 된다
    // 문장으로 감싸지 않는다. ALLERGY 카테고리가 이미 "먹으면 안 됨"을 뜻하고,
    // 이름만 있어야 재고·프롬프트에서 그대로 대조할 수 있다.
    toMemory: (v) => v,
  },
  {
    key: 'appliance',
    label: '조리도구',
    hint: '있는 도구로 만들 수 있는 걸 추천할게',
    options: ['전자레인지', '에어프라이어', '인덕션', '가스레인지', '오븐', '밥솥'],
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
  category: 'ALLERGY' | 'PREFERENCE' | 'PROFILE' | 'OWNERSHIP';
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

// ⚠️ 시스템 프롬프트 **문구와 조립 순서는 여기 없다** — `conversation/conversation.prompt.ts` 가 소유한다.
// 이 파일은 캐릭터 **API 의 데이터**(선택지 vocab·입력 제한·태그→메모리 매핑)만 담당한다.
// 예전엔 문구가 여기와 conversation 양쪽에 흩어져 있어서, 한 줄 고치려면 두 파일을 오가야 했고
// 최종 프롬프트에서 무엇이 몇 번째로 들어가는지 읽어낼 수 없었다.
