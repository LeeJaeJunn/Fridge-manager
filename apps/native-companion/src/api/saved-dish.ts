import { apiFetch } from '@/api/client';
import type {
  SaveDishRequestType,
  SavedDishType,
  UpdateSavedDishRequestType,
} from '@companion/types';

/** 저장한 요리 전체를 최근 수정순으로 불러온다. */
export function fetchSavedDishes(): Promise<SavedDishType[]> {
  return apiFetch<SavedDishType[]>('/saved-dishes');
}

/** 요리 카드의 편집된 스냅샷을 저장한다. */
export function saveDish(body: SaveDishRequestType): Promise<SavedDishType> {
  return apiFetch<SavedDishType>('/saved-dishes', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 저장한 요리의 내용만 부분 수정한다. */
export function updateSavedDish(
  id: string,
  body: UpdateSavedDishRequestType,
): Promise<SavedDishType> {
  return apiFetch<SavedDishType>(`/saved-dishes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** 저장 해제. 서버는 성공 시 본문 없는 204를 반환한다. */
export function deleteSavedDish(id: string): Promise<void> {
  return apiFetch<void>(`/saved-dishes/${id}`, { method: 'DELETE' });
}
