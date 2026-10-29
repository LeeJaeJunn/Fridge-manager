import type { MemoryCategoryType, MemoryOptionsType } from '@companion/types';
import { TAG_GROUPS } from '../character/persona';

export const MEMORY_LIMITS = { contentMax: 40 };
export const MEMORY_CATEGORIES = [
  'ALLERGY',
  'PREFERENCE',
  'PROFILE',
  'OWNERSHIP',
  'ETC',
] as const satisfies readonly MemoryCategoryType[];

/** 온보딩과 직접 추가는 같은 예시 vocab 을 사용한다. 반환 배열은 호출자 소유다. */
export function memoryOptions(): MemoryOptionsType {
  const onboardingExamples = (category: MemoryCategoryType): string[] =>
    TAG_GROUPS.filter((group) => group.category === category).flatMap((group) => group.options);

  return {
    examples: {
      ALLERGY: onboardingExamples('ALLERGY'),
      PREFERENCE: onboardingExamples('PREFERENCE'),
      PROFILE: ['자취 중', '요리 초보', '1인분만 해먹음', '아침은 간단히 먹음', '다이어트 중'],
      OWNERSHIP: onboardingExamples('OWNERSHIP'),
      ETC: ['도시락을 자주 싸요', '야식을 자주 먹음', '설거지는 적을수록 좋음'],
    },
    limits: { ...MEMORY_LIMITS },
  };
}
