/** 저장한 레시피의 재료 한 줄 — **재고 매칭 정보를 담지 않는다**(카드와 다른 점). */
export interface SavedDishIngredientType {
  name: string;
  /** "200g", "반 모" — 자유텍스트. 레시피 단위는 정규화가 안 된다 */
  amount: string;
}

/** GET /saved-dishes 의 한 건 */
export interface SavedDishType {
  id: string;
  /** 저장의 출처가 된 요리 카드(Message.id) — 채팅에서 별을 채울지 판정하는 키 */
  sourceMessageId: string;
  dishName: string;
  servings: number;
  /** 모르면 null (카드의 `cookMinutes` 는 선택 필드다) */
  cookMinutes: number | null;
  ingredients: SavedDishIngredientType[];
  steps: string[];
  createdAt: string;
  updatedAt: string;
}

/** POST /saved-dishes — 사용자가 모달에서 확인·편집한 최종 값 */
export interface SaveDishRequestType {
  sourceMessageId: string;
  dishName: string;
  servings: number;
  /** **있을 때만** 싣는다. 생략 = 미설정(null 로 저장) */
  cookMinutes?: number;
  ingredients: SavedDishIngredientType[];
  steps: string[];
}

/**
 * PATCH /saved-dishes/:id — 부분 수정.
 *
 * ⚠️ `cookMinutes` 는 **세 가지 뜻**이다 — 생략(미변경) / 숫자(그 값) / `null`(미설정으로 되돌리기).
 * (`UpdateIngredientRequestType.expiresAt` 과 같은 방식)
 */
export interface UpdateSavedDishRequestType {
  dishName?: string;
  servings?: number;
  cookMinutes?: number | null;
  ingredients?: SavedDishIngredientType[];
  steps?: string[];
}
