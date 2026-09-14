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

/**
 * ⚠️ **미설정이면 `null`** — 신선도를 말할 근거가 없다. 유통기한은 사용자가 넣기로 한 재료에만
 * 있으므로(미설정이 기본) 이 경로가 오히려 흔하다.
 *
 * `'unset'` 같은 단계를 만들지 않는 이유: 그러면 회색 배지가 **모든 재료에** 붙어서, 정작
 * 봐야 할 "오늘까지" 배지가 그 사이에 묻힌다. 모르는 건 비워두는 게 정보량이 더 크다.
 */
export function freshness(expiresAt: string | null, now = new Date()): Freshness | null {
  if (!expiresAt) return null;
  const d = daysLeft(expiresAt, now);
  if (d < 0) return 'past'; // 지남
  if (d === 0) return 'urgent'; // 오늘
  if (d <= 2) return 'soon'; // 이틀 안
  return 'fresh';
}

/**
 * 남은 기간 라벨. **미설정이면 `null`**(배지를 안 그린다) — `freshness` 와 짝이라 같이 판단한다.
 *
 * ⚠️ 예전엔 추정치에 "쯤"을 붙였다. 이제 서버가 추정하지 않으므로 흐릴 것도 없다 —
 * 여기 있는 날짜는 전부 사용자가 넣기로 한 값이다.
 */
export function expiryLabel(item: Pick<IngredientType, 'expiresAt'>): string | null {
  if (!item.expiresAt) return null;
  const d = daysLeft(item.expiresAt);
  if (d < 0) return `${-d}일 지남`;
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

/**
 * 홈 "먼저 먹어요" 섹션에 올릴지 — 오늘 이내이거나 이미 지난 것.
 * **미설정은 올리지 않는다** — 급한지 아닌지 모르는 걸 급하다고 말할 수 없다.
 * (서버의 `expiringSoon` 이 `expiresAt <= :until` 로 NULL 을 빼는 것과 같은 판단이다.)
 */
export const shouldNudge = (item: Pick<IngredientType, 'expiresAt'>): boolean =>
  item.expiresAt !== null && daysLeft(item.expiresAt) <= 0;

/**
 * 홈 "냉장고 현황" 카드용 재고 요약.
 * 버킷은 서로 겹치지 않아 **today + week + rest + unset = total** 이다.
 * `today` 는 오늘까지(지남 포함) — `shouldNudge` 와 같은 기준이라 "먼저 먹어요" 목록 개수와 일치한다.
 *
 * ⚠️ **`unset` 을 `rest`("여유") 에 합치지 않는다.** 미설정은 "여유 있다"가 아니라 "모른다"이고,
 * 미설정이 기본값이라 합치면 그 숫자가 거의 전부를 삼켜 "여유"가 아무 뜻도 없는 값이 된다.
 * 따로 세면 그 숫자 자체가 "유통기한을 넣어두면 쓸모가 있다"는 안내가 되기도 한다.
 */
export type InventorySummary = {
  total: number;
  today: number;
  week: number;
  rest: number;
  unset: number;
};

export function summarize(
  items: Pick<IngredientType, 'expiresAt'>[],
  now = new Date(),
): InventorySummary {
  let today = 0;
  let week = 0;
  let rest = 0;
  let unset = 0;
  for (const item of items) {
    if (!item.expiresAt) {
      unset += 1;
      continue;
    }
    const d = daysLeft(item.expiresAt, now);
    if (d <= 0) today += 1;
    else if (d <= 7) week += 1;
    else rest += 1;
  }
  return { total: items.length, today, week, rest, unset };
}
