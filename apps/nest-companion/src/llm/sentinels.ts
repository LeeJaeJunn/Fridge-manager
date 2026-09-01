/**
 * 모델이 "값 없음"을 **문자열로** 흘리는 걸 막는다.
 *
 * ⚠️ **Structured Outputs 는 타입만 강제한다.** 스키마가 `string | null` 이어도 모델은
 * `"null"`·`"없음"` 같은 **문자열**을 낼 수 있고, 그건 유효한 string 이라 그대로 통과한다.
 * 실측으로 두 번 겪었다 — 스캔이 냉장고에 `없음` 을 저장했고, 소비 계산이 남은 양을 `"null"` 로
 * 채웠다. 그래서 **지시문만 고치는 걸로는 부족하다**: 지시문은 확률을 낮출 뿐이고, 여기가 경계다.
 *
 * 산수나 판단을 대신하는 게 아니라 **쓰레기 값을 걸러내는 경계 방어**다
 * (`parseArgs` 가 깨진 JSON 을 막는 것과 같은 자리).
 */
const EMPTY_SENTINELS = ['null', 'none', 'n/a', 'na', 'undefined', '없음', '없다', '-', '모름'];

/** 의미 있는 값이면 다듬어 돌려주고, 비었거나 "값 없음" 흉내면 `undefined`. */
export function cleanLlmText(v: string | null | undefined): string | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  return EMPTY_SENTINELS.includes(t.toLowerCase()) ? undefined : t;
}
