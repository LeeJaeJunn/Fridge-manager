import { apiFetch } from '@/api/client';
import type { MemoryType } from '@companion/types';

/** 내 장기 메모리 전체 ("AI가 기억하는 나") */
export function fetchMemories(): Promise<MemoryType[]> {
  return apiFetch<MemoryType[]>('/memories');
}

/** 메모리 삭제 (교정용) */
export function deleteMemory(id: string): Promise<void> {
  return apiFetch<void>(`/memories/${id}`, { method: 'DELETE' });
}
