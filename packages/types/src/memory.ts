/**
 * 장기 메모리 — "AI가 기억하는 나" 화면용 클라이언트↔서버 공유 계약.
 * MemoryCategoryType 은 prisma 의 MemoryCategory enum 과 동기화한다(소수·정적이라 수동 미러).
 */

export type MemoryCategoryType =
  | 'ALLERGY' // 먹으면 안 되는 것 — content 는 재료·분류 **이름만** ("오이", "갑각류")
  | 'PREFERENCE' // 식성 (매운 음식 좋아함, 오이 싫어함, 채식 등)
  | 'PROFILE' // 프로필·성향 (자취·요리 실력·1인분 등 지속 사실)
  | 'OWNERSHIP' // 조리도구·주방 환경
  | 'ETC'; // 기타

/** GET /memories 응답 항목 */
export interface MemoryType {
  id: string;
  category: MemoryCategoryType;
  content: string;
  createdAt: string;
}
