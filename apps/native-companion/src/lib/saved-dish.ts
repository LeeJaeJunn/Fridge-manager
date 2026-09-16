import type {
  DishProposalType,
  SaveDishRequestType,
  SavedDishIngredientType,
  SavedDishType,
  UpdateSavedDishRequestType,
} from '@companion/types';

/** 모달이 편집하는 값. 화면 상태라 서버 계약과 따로 둔다(`cookMinutes` 를 null 로 들고 있다). */
export type SavedDishDraftType = {
  dishName: string;
  servings: number;
  cookMinutes: number | null;
  ingredients: SavedDishIngredientType[];
  steps: string[];
};

/**
 * 입력칸 `maxLength` 용. ⚠️ **권위는 서버 DTO(`saved-dish.limits.ts`)** 이고 여기는 미리 막는 UX 다 —
 * 값이 어긋나면 서버가 400 으로 거절한다. 서버 값을 바꾸면 여기도 함께 바꾼다.
 */
export const SAVED_DISH_INPUT_LIMITS = {
  dishNameMax: 40,
  ingredientNameMax: 40,
  amountMax: 40,
  stepMax: 300,
  ingredientsMax: 30,
  stepsMax: 30,
};

/** 요리 카드 → 저장 초안. **그 시점 재고 정보(`ingredientId`·`currentQuantityNote`)는 버린다.** */
export function draftFromDish(dish: DishProposalType): SavedDishDraftType {
  return {
    dishName: dish.dishName,
    servings: dish.servings,
    cookMinutes: dish.cookMinutes ?? null,
    ingredients: dish.ingredients.map((ingredient) => ({
      name: ingredient.name,
      amount: ingredient.amount,
    })),
    steps: [...dish.steps],
  };
}

/** 저장된 요리 → 초안 (채워진 별을 눌렀을 때). */
export function draftFromSaved(saved: SavedDishType): SavedDishDraftType {
  return {
    dishName: saved.dishName,
    servings: saved.servings,
    cookMinutes: saved.cookMinutes,
    ingredients: saved.ingredients.map((ingredient) => ({ ...ingredient })),
    steps: [...saved.steps],
  };
}

/** 초안 → POST 본문. `cookMinutes` 는 **있을 때만** 싣는다(생략 = 미설정). */
export function toSaveRequest(
  draft: SavedDishDraftType,
  sourceMessageId: string,
): SaveDishRequestType {
  return {
    sourceMessageId,
    dishName: draft.dishName,
    servings: draft.servings,
    ...(draft.cookMinutes === null ? {} : { cookMinutes: draft.cookMinutes }),
    ingredients: draft.ingredients,
    steps: draft.steps,
  };
}

/** 초안 → PATCH 본문. `cookMinutes` 는 **null 도 싣는다** — 생략은 "미변경"이라 지울 방법이 없다. */
export function toUpdateRequest(draft: SavedDishDraftType): UpdateSavedDishRequestType {
  return {
    dishName: draft.dishName,
    servings: draft.servings,
    cookMinutes: draft.cookMinutes,
    ingredients: draft.ingredients,
    steps: draft.steps,
  };
}
