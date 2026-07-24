import { apiFetch } from '@/api/client';
import type {
  AddIngredientInputType,
  IngredientType,
  InventoryOptionsType,
  UpdateIngredientRequestType,
} from '@companion/types';

/** 냉장고 화면 선택지 (카테고리/보관위치 라벨 + 입력 제한) — 서버가 목록을 소유한다 */
export function fetchInventoryOptions(): Promise<InventoryOptionsType> {
  return apiFetch<InventoryOptionsType>('/inventory/options');
}

/** 안 먹은 재고 전부 (임박순) */
export function fetchInventory(): Promise<IngredientType[]> {
  return apiFetch<IngredientType[]>('/inventory');
}

/** 곧 지나는 재료 (이미 지난 것 포함, 임박순) — 홈 상단 섹션용 */
export function fetchExpiring(days = 3): Promise<IngredientType[]> {
  return apiFetch<IngredientType[]>(`/inventory/expiring?days=${days}`);
}

/** 재료 추가 (여러 건). 만료일은 서버가 채워 돌려준다 */
export function addIngredients(items: AddIngredientInputType[]): Promise<IngredientType[]> {
  return apiFetch<IngredientType[]>('/inventory', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

/** 재료 교정 (이름·분류·수량·보관위치·만료일) */
export function updateIngredient(
  id: string,
  patch: UpdateIngredientRequestType,
): Promise<IngredientType> {
  return apiFetch<IngredientType>(`/inventory/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** 다 먹음 (soft delete — 되돌릴 수 있다) */
export function consumeIngredient(id: string): Promise<void> {
  return apiFetch<void>(`/inventory/${id}`, { method: 'DELETE' });
}

/** 소비 취소 (되돌리기) */
export function restoreIngredient(id: string): Promise<void> {
  return apiFetch<void>(`/inventory/${id}/restore`, { method: 'POST' });
}

/** 완전 삭제 (잘못 등록 — 이력에도 안 남긴다, 되돌리기 없음) */
export function removeIngredient(id: string): Promise<void> {
  return apiFetch<void>(`/inventory/${id}/hard`, { method: 'DELETE' });
}
