import { apiFetch } from '@/api/client';
import type {
  CreateMemoryRequestType,
  MemoryOptionsType,
  MemoryType,
  UpdateMemoryRequestType,
} from '@companion/types';

/** 내 장기 메모리 전체 ("AI가 기억하는 나") */
export function fetchMemories(): Promise<MemoryType[]> {
  return apiFetch<MemoryType[]>('/memories');
}

/** 직접 추가·수정 폼의 예시와 입력 제한. */
export function fetchMemoryOptions(): Promise<MemoryOptionsType> {
  return apiFetch<MemoryOptionsType>('/memories/options');
}

/** 사용자가 입력한 내용을 직접 기억한다. */
export function createMemory(body: CreateMemoryRequestType): Promise<MemoryType> {
  return apiFetch<MemoryType>('/memories', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 기억의 내용이나 카테고리를 수정한다. */
export function updateMemory(id: string, body: UpdateMemoryRequestType): Promise<MemoryType> {
  return apiFetch<MemoryType>(`/memories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** 메모리 삭제 (교정용) */
export function deleteMemory(id: string): Promise<void> {
  return apiFetch<void>(`/memories/${id}`, { method: 'DELETE' });
}
