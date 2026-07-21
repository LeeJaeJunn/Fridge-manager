/**
 * 장기 메모리 — "AI가 기억하는 나" 화면용 클라이언트↔서버 공유 계약.
 * MemoryCategoryType 은 prisma 의 MemoryCategory enum 과 동기화한다(소수·정적이라 수동 미러).
 */

export type MemoryCategoryType =
  | 'PREFERENCE' // 선호 (브랜드·제품·스타일·소비 성향)
  | 'PROFILE' // 프로필·성향 (자취·전공·신체특성·성격 등 지속 사실)
  | 'OWNERSHIP' // 보유·이력 (지금 쓰는/가진 것, 구매 이력)
  | 'ETC'; // 기타

/** GET /memories 응답 항목 */
export interface MemoryType {
  id: string;
  category: MemoryCategoryType;
  content: string;
  importance: number;
  createdAt: string;
}
