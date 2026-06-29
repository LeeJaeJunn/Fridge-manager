/**
 * 장기 메모리 — "AI가 기억하는 나" 화면용 클라이언트↔서버 공유 계약.
 * MemoryCategoryType 은 prisma 의 MemoryCategory enum 과 동기화한다(소수·정적이라 수동 미러).
 */

export type MemoryCategoryType =
  | 'INTEREST' // 관심사·취향
  | 'WORK' // 학습·업무
  | 'GOAL' // 목표·계획
  | 'LIFESTYLE' // 생활·건강
  | 'RELATIONSHIP' // 인간관계
  | 'TRAIT' // 개인 특성
  | 'ETC'; // 기타

/** GET /memories 응답 항목 */
export interface MemoryType {
  id: string;
  category: MemoryCategoryType;
  content: string;
  importance: number;
  createdAt: string;
}
