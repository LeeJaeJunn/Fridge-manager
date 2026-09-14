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
 * `expiresAt` 이 **어떻게 정해졌는지**.
 * - `USER` — 사용자가 날짜를 직접 골랐다
 * - `ESTIMATED` — 사용자가 "기본값"을 선택해서 카테고리×보관위치 추정치가 들어갔다
 * - `NONE` — 아무것도 안 정했다 (`expiresAt` 은 null)
 *
 * ⚠️ **화면은 이 값을 읽지 않는다.** 예전엔 "8/12까지" vs "8/12쯤" 을 가르는 데 썼지만,
 * 이제 날짜는 사용자가 넣기로 한 것만 있으므로 표기를 흐릴 이유가 없다.
 * 남겨두는 건 **"사람들이 유통기한을 실제로 넣는가"를 나중에 재기 위한 기록**이다
 * (넣는다면 직접 고르는지 기본값에 맡기는지도 함께). 그러니 안 읽힌다고 지우지 말 것.
 */
export type ExpirySourceType = 'USER' | 'ESTIMATED' | 'NONE';

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
  /**
   * ISO 날짜, 또는 **null = 미설정**.
   *
   * 서버가 추정해서 자동으로 채우지 않는다 — 사용자가 직접 고르거나 "기본값"을 선택했을 때만
   * 값이 생긴다. 추정은 대체로 틀리는데 화면에서는 확정값과 구분이 안 돼서, 차라리 비워둔다.
   * 다른 뜻은 없다: **null 아니면 날짜**이고, 그 날짜가 사용자 입력인지 기본값인지는
   * `expirySource` 가 따로 기록한다(화면은 안 읽는다).
   */
  expiresAt: string | null;
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
  /**
   * 사용자가 날짜를 정한 경우만 (ISO). **생략하면 미설정(null)으로 들어간다** — 서버는 추정하지 않는다.
   * "기본값"을 고른 경우엔 앱이 추정일을 계산해 실어 보내고, 그때 `expirySource=ESTIMATED` 가 된다.
   */
  expiresAt?: string;
  /**
   * 위 날짜가 사용자가 직접 고른 것(`USER`)인지 "기본값"(`ESTIMATED`)인지.
   * 날짜가 없으면 무시된다(서버가 `NONE` 으로 쓴다). 생략하면 `USER` 로 본다.
   */
  expirySource?: ExpirySourceType;
}

/** POST /inventory — 여러 건을 한 번에 넣는다 ("계란이랑 우유 사왔어") */
export interface AddIngredientsRequestType {
  items: AddIngredientInputType[];
}

/**
 * 넣기 **제안** 한 항목 — 아직 저장되지 않았고 사용자 확인을 기다리는 상태.
 * 서버가 파싱·정규화해 담는다(`previewAdd`). 저장은 사용자가 확인한 뒤에 일어난다.
 *
 * 만들어지는 경로가 둘이고 화면(확인 카드)은 하나다:
 *  - 채팅 툴(`update_inventory`)의 add
 *  - 영수증·사진 스캔(`POST /inventory/scan`)
 */
export interface AddProposalItemType {
  name: string;
  category: IngredientCategoryType;
  storage: StorageAreaType;
  /** **저장될 최종 수량** — 이미 있는 재료면 합산된 값이다 */
  quantityNote?: string;
  /**
   * 만료일 (ISO) 또는 **null = 미설정**. 서버는 추정해 채우지 않는다 — 채팅·스캔에서 사용자가
   * 날짜를 말한 경우, 또는 이미 있는 재고의 날짜를 이어받은 경우에만 값이 있다.
   * (예전 이름은 `estimatedExpiry` 였는데, 더 이상 추정치가 아니라서 바꿨다.)
   */
  expiresAt: string | null;
  expirySource: ExpirySourceType;
  /**
   * 같은 이름의 재고가 이미 있을 때만 채워지는 **합산 근거**(표시 전용).
   * 저장은 `quantityNote` 하나로 이뤄지고, 이건 "왜 그 숫자인지"를 화면에서 설명하기 위한 것이다.
   *
   * ⚠️ 알려진 한계: 유통기한이 다른 두 묶음(8/4까지 남은 것 + 오늘 산 8/11까지)은 **한 행으로
   * 표현되지 않는다.** 이번에 날짜가 오면 그 값이 이기고(기존 몫이 언제까지였는지는 사라진다),
   * 안 오면 기존 날짜가 유지된다(새로 산 몫이 더 오래가도 옛 날짜로 보인다). 어느 쪽이든 두 묶음 중
   * 하나의 사실만 남는다. "기존에 합치기 / 따로 추가" 선택을 넣을 때 함께 해결한다.
   */
  merge?: {
    /** 지금 냉장고에 있는 수량 메모 */
    existing?: string;
    /** 이번에 산 수량 메모 (영수증·사진에서 읽은 값) */
    added?: string;
  };
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
  /**
   * ⚠️ **세 가지가 다른 뜻이다** — 생략 = 미변경 / 날짜 = 그 날로 / **`null` = 미설정으로 되돌리기**.
   * 미설정이 정상 상태가 되면서 "정해둔 날짜를 지우는" 조작이 필요해졌고, 생략과 구분돼야 한다.
   */
  expiresAt?: string | null;
  /** 위 날짜의 출처. 날짜를 보낼 때만 의미가 있다(생략하면 `USER`). */
  expirySource?: ExpirySourceType;
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
   * 카테고리×보관위치 → 소비기한 일수. **앱이 "기본값" 만료일을 계산하는 재료**다 —
   * 사용자가 그 선택지를 고르면 앱이 이 표로 날짜를 만들어 서버에 실어 보낸다(서버는 추정하지 않는다).
   * 표를 서버가 소유하는 건 앱 배포 없이 값을 고치기 위해서다(`shelf-life.ts` 가 단일 출처).
   * storage → category → days. 없는 조합은 defaultDays 로 폴백한다.
   */
  shelfLife: {
    days: Record<string, Record<string, number>>;
    defaultDays: number;
  };
}
