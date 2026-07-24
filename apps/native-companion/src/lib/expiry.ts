import type { IngredientType } from '@companion/types';

/**
 * 유통기한 표시 규칙 — 냉장고 화면과 홈이 공유한다.
 * 서버 buildInstruction 과 같은 판단(자정 기준 남은 일수)을 클라에서도 쓴다.
 *
 * 카피는 "곧 상해요" 같은 위협조 대신 **"먼저 먹어요"** 톤으로 — 유저를 다그치지 않고
 * 자연스럽게 오래 둔 재료로 눈을 돌리게 한다. 문구는 전부 이 파일 한 곳에서 바꾼다.
 */

const MS_PER_DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 자정 기준 남은 일수 (음수면 지남). 시:분 차이로 흔들리지 않게 날짜만 비교한다. */
export function daysLeft(expiresAt: string, now = new Date()): number {
  return Math.round((startOfDay(new Date(expiresAt)) - startOfDay(now)) / MS_PER_DAY);
}

/** 신선도 단계 — 색·정렬·홈 노출 판단의 기준. */
export type Freshness = 'past' | 'urgent' | 'soon' | 'fresh';

export function freshness(expiresAt: string, now = new Date()): Freshness {
  const d = daysLeft(expiresAt, now);
  if (d < 0) return 'past'; // 지남
  if (d === 0) return 'urgent'; // 오늘
  if (d <= 2) return 'soon'; // 이틀 안
  return 'fresh';
}

/** 남은 기간 라벨. 추정치는 "쯤"을 붙여 단정하지 않는다(서버 표기와 일치). */
export function expiryLabel(item: Pick<IngredientType, 'expiresAt' | 'expirySource'>): string {
  const d = daysLeft(item.expiresAt);
  // 추정치에 "쯤"을 붙이는 표기는 잠시 꺼둠 — 되살리려면 아래 두 줄 주석을 푼다.
  // const approx = item.expirySource === 'ESTIMATED';
  // const suffix = approx ? '쯤' : '';
  if (d < 0) return `${-d}일 지남`;
  // if (d === 0) return `오늘까지${suffix}`;
  // if (d === 1) return `내일까지${suffix}`;
  // return `${d}일 남음${suffix}`;
  if (d === 0) return `오늘까지`;
  if (d === 1) return `내일까지`;
  return `${d}일 남음`;
}

/** 신선도 → 파스텔 틴트 토큰 (Chip/배지용). fresh 는 배지를 안 붙이는 게 보통이라 중립. */
export const FRESHNESS_STYLE: Record<Freshness, { bg: string; text: string }> = {
  past: { bg: 'bg-peach-soft', text: 'text-peach' },
  urgent: { bg: 'bg-peach-soft', text: 'text-peach' },
  soon: { bg: 'bg-amber-soft', text: 'text-amber-deep' },
  fresh: { bg: 'bg-sand', text: 'text-ink-soft' },
};

/** 홈 "먼저 먹어요" 섹션에 올릴지 — 오늘 이내이거나 이미 지난 것. */
export const shouldNudge = (item: Pick<IngredientType, 'expiresAt'>): boolean =>
  daysLeft(item.expiresAt) <= 0;
