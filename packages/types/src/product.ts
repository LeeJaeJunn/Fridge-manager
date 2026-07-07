/**
 * 커머스 상품 — 클라이언트↔서버 공유 계약.
 * 벤더(naver/coupang/amazon/dummy) 응답을 이 "정규화된" 형태로 통일한다.
 * 벤더별 차이(HTML 태그 title, 문자열 가격, 통화, 리뷰 유무)는 각 프로바이더가 흡수한다.
 */

/** 상품 출처 (프로바이더 식별) */
export type CommerceProviderType = 'dummy' | 'naver' | 'coupang' | 'amazon';

/** 정규화된 상품 한 건 (상품 카드 렌더 + 추천 이유 생성 재료) */
export interface ProductType {
  id: string; // 프로바이더별 상품 id
  provider: CommerceProviderType;
  title: string; // 정규화됨 (HTML 태그 제거)
  price: number; // 최저가 (숫자)
  currency: 'KRW' | 'USD';
  imageUrl: string;
  productUrl: string; // 상품/제휴 링크
  mallName?: string;
  brand?: string;
  category?: string;
  /** 추천 이유의 재료. 더미는 채우고, 실제 검색 API는 빈약할 수 있음 */
  description?: string;
  // ── 프로바이더별 옵셔널 신호 (있는 것만 채움; LLM/랭킹은 present 필드만 사용) ──
  rating?: number; // 평점 (예: 아마존 PA-API)
  reviewCount?: number;
  isRocket?: boolean; // 빠른배송 등 (예: 쿠팡 로켓)
}

/** 상품 검색 조건 — 실제 커머스 API가 "검색 엔드포인트"라 catalog가 아닌 search 형태로 모델링 */
export interface ProductSearchCriteriaType {
  keywords: string; // 검색어
  category?: string;
  priceMin?: number;
  priceMax?: number;
  limit?: number; // 반환 개수 (기본 10)
  start?: number; // 검색 시작 위치 (이어보기 커서, 기본 1). 서버가 준 nextStart 를 그대로 넣는다.
}

/**
 * 상품 검색 결과(페이지). nextStart 는 "더보기" 시 클라가 그대로 돌려보내는 opaque 커서다.
 * (필터·slice 때문에 클라가 직접 계산하면 겹치므로, 서버가 소비한 위치를 내려준다)
 */
export interface ProductSearchResultType {
  products: ProductType[];
  nextStart: number;
  hasMore: boolean;
}
