/**
 * 냉장고 재고(식재료) — 클라이언트↔서버 공유 계약.
 *
 * 재고는 Memory(자유텍스트 장기기억)가 아니라 **별도 테이블**이다.
 * 상태가 계속 변하고 "유통기한 임박" 같은 날짜 쿼리가 필요하기 때문 — 자유텍스트로는 둘 다 안 된다.
 *
 * 대신 **쿼리가 필요한 것만 구조화**한다: name(레시피 매칭)·expiresAt(임박 정렬)·consumedAt(소비 여부).
 * 수량은 `quantityNote` 자유텍스트다 — 앱은 실제 소비를 관찰하지 못하므로(김치찌개 하나에 대파가
 * 몇 단 줄었는지 알 수 없다) 숫자를 들고 있어도 금방 허구가 되고, 틀린 숫자는 신뢰를 깎는다.
 */

/** 보관 위치 — 소비기한 추정에 영향(냉동이 가장 길다) */
export type StorageAreaType = 'FRIDGE' | 'FREEZER' | 'PANTRY';

/**
 * expiresAt 의 출처.
 * 'USER' = 사용자가 알려준 실제 표기일(신뢰), 'ESTIMATED' = 카테고리×보관위치 기반 추정(참고).
 * UI 는 이 값으로 "8/12까지" vs "8/12쯤" 을 가른다.
 */
export type ExpirySourceType = 'USER' | 'ESTIMATED';

/** 재료 분류 — 소비기한 추정 기준 + 화면 그룹핑 */
export type IngredientCategoryType =
  | 'VEGETABLE' // 채소
  | 'FRUIT' // 과일
  | 'MEAT' // 육류
  | 'SEAFOOD' // 해산물
  | 'DAIRY' // 유제품
  | 'EGG' // 달걀
  | 'GRAIN' // 곡물·면·빵
  | 'SAUCE' // 양념·소스
  | 'PROCESSED' // 가공식품·통조림
  | 'FROZEN' // 냉동식품
  | 'ETC'; // 기타

/** 재고 한 건 (냉장고 화면 렌더 + 레시피 추천 재료) */
export interface IngredientType {
  id: string;
  name: string; // 정규화된 재료명 ("계란")
  category: IngredientCategoryType;
  /** 수량 자유텍스트 ("한 판", "1L", "반 팩", "개봉함"). 표시 전용 — 계산하지 않는다. */
  quantityNote?: string;
  storage: StorageAreaType;
  addedAt: string; // ISO — 등록(구입) 시점. 추정의 기준점
  expiresAt: string; // ISO — 항상 채워진다 (USER 값 또는 추정치)
  expirySource: ExpirySourceType;
  /** 소비 완료 시각 (ISO). 있으면 냉장고에서 빠진 상태 — soft delete 라 복구 가능 */
  consumedAt?: string;
}

/** 재료 하나를 넣을 때의 입력. category/storage 를 생략하면 서버가 추론한다. */
export interface AddIngredientInputType {
  name: string;
  category?: IngredientCategoryType;
  quantityNote?: string;
  storage?: StorageAreaType;
  /** 사용자가 실제 표기일을 알려준 경우만 (ISO). 없으면 서버가 추정해 채운다. */
  expiresAt?: string;
}

/** POST /inventory — 여러 건을 한 번에 넣는다 ("계란이랑 우유 사왔어") */
export interface AddIngredientsRequestType {
  items: AddIngredientInputType[];
}

/**
 * 넣기 **제안** 한 항목 — 아직 저장되지 않았고 사용자 확인을 기다리는 상태.
 * 서버가 파싱·정규화하고 만료일을 추정해 담는다(`previewAdd`). 저장은 사용자가 확인한 뒤에 일어난다.
 *
 * 만들어지는 경로가 둘이고 화면(확인 카드)은 하나다:
 *  - 채팅 툴(`update_inventory`)의 add
 *  - 영수증·사진 스캔(`POST /inventory/scan`)
 */
export interface AddProposalItemType {
  name: string;
  category: IngredientCategoryType;
  storage: StorageAreaType;
  quantityNote?: string;
  /** 추정 만료일 (ISO). 사용자가 표기일을 줬으면 그 값 */
  estimatedExpiry: string;
  expirySource: ExpirySourceType;
}

/** 스캔에 넘긴 이미지가 무엇인지 — 서버가 이걸로 프롬프트를 고른다. */
export type ScanKindType = 'receipt' | 'photo';

/**
 * `POST /inventory/scan` 응답 — **저장하지 않은** 제안 목록.
 * 클라가 확인·편집한 뒤 `POST /inventory` 로 실제 저장한다(채팅 확인 카드와 같은 방침).
 * 식재료를 못 찾으면 빈 배열이며, 그것도 정상 응답이다.
 */
export interface ScanResultType {
  items: AddProposalItemType[];
}

/** PATCH /inventory/:id — 교정용 부분 수정 */
export interface UpdateIngredientRequestType {
  name?: string;
  category?: IngredientCategoryType;
  quantityNote?: string;
  storage?: StorageAreaType;
  expiresAt?: string;
}

/** 값→라벨 한 쌍 (화면 표시용) */
export interface InventoryOptionType {
  value: string;
  label: string;
}

/**
 * GET /inventory/options — native 가 렌더할 선택지(서버 소유 단일 출처).
 * 라벨을 앱에 하드코딩하지 않으므로 앱 배포 없이 문구를 바꿀 수 있다.
 */
export interface InventoryOptionsType {
  categories: InventoryOptionType[];
  storages: InventoryOptionType[];
  limits: {
    nameMax: number;
    quantityNoteMax: number;
    itemsMax: number;
  };
  /**
   * 카테고리×보관위치 → 소비기한 일수. 추가 폼에서 "기본값(자동 추정)" 만료일을
   * 미리 보여주기 위한 것 — 서버 추정과 같은 표(shelf-life)를 내려준다.
   * storage → category → days. 없는 조합은 defaultDays 로 폴백한다.
   */
  shelfLife: {
    days: Record<string, Record<string, number>>;
    defaultDays: number;
  };
}
