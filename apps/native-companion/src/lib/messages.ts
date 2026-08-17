/**
 * 대화 아이템 해석 헬퍼 — 채팅 화면이 툴 호출/결과를 화면용으로 좁히는 유일한 지점.
 *
 * 서버는 툴 호출을 **일반 봉투**(`name` + `arguments` + `resolved`)로 내려준다. 툴이 늘어도 계약이
 * 안 바뀌는 대신, 어떤 툴인지는 소비처가 `name` 으로 판정해야 한다. 그 캐스팅을 여기 한 곳에 모은다.
 */

import type {
  FunctionCallMessageType,
  FunctionOutputMessageType,
  InventoryProposalType,
  MessageType,
  RecipeType,
} from '@companion/types';

/** 재고 변경 툴 이름 — 서버 `UPDATE_INVENTORY_TOOL.name` 과 같아야 한다. */
export const INVENTORY_TOOL = 'update_inventory';

/** 레시피 검색 툴 이름 — 서버 `SEARCH_RECIPES_TOOL.name` 과 같아야 한다. */
export const RECIPE_TOOL = 'search_recipes';

/**
 * 툴 호출 → 재고 확인 카드용 제안.
 * **앱이 모르는 툴이면 null** 을 돌려준다 — 백엔드에 툴이 추가돼도 구버전 앱은 그 아이템을
 * 조용히 건너뛸 뿐 깨지지 않는다(이 구조를 택한 이유 중 하나).
 */
export function toInventoryProposal(m: FunctionCallMessageType): InventoryProposalType | null {
  if (m.payload.name !== INVENTORY_TOOL) return null;
  return (m.payload.resolved as InventoryProposalType | undefined) ?? null;
}

/**
 * 레시피 검색 결과 — **호출이 아니라 결과 아이템**에서 읽는다.
 *
 * 재고와 반대다: 재고는 호출이 "확인 대기 중인 제안"이라 `FUNCTION_CALL` 에 카드를 그리지만,
 * 레시피는 서버가 이미 실행했고 **결과가 곧 내용**이라 `FUNCTION_CALL_OUTPUT` 에 그린다.
 * (그래서 레시피의 `FUNCTION_CALL` 아이템은 화면에 아무것도 만들지 않는다)
 *
 * 모르는 툴이면 `null` — 백엔드에 툴이 늘어도 구버전 앱이 안 깨지는 장치다.
 */
export type RecipeResultType = {
  dishName: string;
  recipes: RecipeType[];
  /** 결과가 없는 이유. 'empty' = 검색은 됐지만 0건, 'unavailable' = 검색 자체가 실패 */
  reason?: 'empty' | 'unavailable';
};

export function toRecipeResult(m: FunctionOutputMessageType): RecipeResultType | null {
  if (m.payload.name !== RECIPE_TOOL) return null;
  const out = m.payload.output as Partial<RecipeResultType> | undefined;
  if (!out) return null;
  return {
    dishName: typeof out.dishName === 'string' ? out.dishName : '',
    recipes: Array.isArray(out.recipes) ? out.recipes : [],
    ...(out.reason ? { reason: out.reason } : {}),
  };
}

export type ProposalOutcomeType = 'applied' | 'dismissed';

/**
 * callId → 처리 결과 맵.
 * 제안의 상태는 별도 필드가 아니라 **짝이 되는 `FUNCTION_CALL_OUTPUT` 의 존재**로 정해진다
 * (서버도 같은 규칙으로 판정한다). 없으면 아직 확인 대기 중이다.
 */
export function outcomesByCallId(messages: MessageType[]): Map<string, ProposalOutcomeType> {
  const map = new Map<string, ProposalOutcomeType>();
  for (const m of messages) {
    if (m.type !== 'FUNCTION_CALL_OUTPUT') continue;
    map.set(m.payload.callId, m.payload.output.applied === true ? 'applied' : 'dismissed');
  }
  return map;
}
