import type { MemoryCategoryType } from '@companion/types';

/** 칩·카드·편집 타일 공용. NativeWind 스캔을 위해 틴트는 전체 클래스 문자열로 둔다. */
export const CATEGORY_META: Record<
  MemoryCategoryType,
  {
    label: string;
    emoji: string;
    iconBg: string;
    iconText: string;
    hint: string;
    placeholder: string;
  }
> = {
  // 추천에서 제외할 안전 정보이므로 맨 앞에 둔다.
  ALLERGY: {
    label: '알레르기',
    emoji: '⚠️',
    iconBg: 'bg-peach-soft',
    iconText: 'text-peach',
    hint: '추천에서 항상 뺄 재료 이름만 알려 주세요',
    placeholder: '예: 땅콩',
  },
  PREFERENCE: {
    label: '식성',
    emoji: '🍽️',
    iconBg: 'bg-blush-soft',
    iconText: 'text-blush',
    hint: '입맛이나 좋아하고 싫어하는 것을 알려 주세요',
    placeholder: '예: 오이를 싫어함',
  },
  PROFILE: {
    label: '프로필',
    emoji: '🧩',
    iconBg: 'bg-sky-soft',
    iconText: 'text-sky-deep',
    hint: '요리 실력이나 생활 패턴을 알려 주세요',
    placeholder: '예: 요리 초보',
  },
  OWNERSHIP: {
    label: '조리도구',
    emoji: '🍳',
    iconBg: 'bg-mint-soft',
    iconText: 'text-mint-deep',
    hint: '가지고 있는 조리도구를 알려 주세요',
    placeholder: '예: 에어프라이어',
  },
  ETC: {
    label: '기타',
    emoji: '📎',
    iconBg: 'bg-sand',
    iconText: 'text-ink-soft',
    hint: '추천할 때 참고할 다른 정보를 알려 주세요',
    placeholder: '예: 도시락을 자주 싸요',
  },
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_META) as MemoryCategoryType[];
