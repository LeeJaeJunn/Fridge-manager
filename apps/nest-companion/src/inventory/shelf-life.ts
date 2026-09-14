import type {
  IngredientCategoryType,
  InventoryOptionsType,
  StorageAreaType,
} from '@companion/types';

/**
 * 소비기한 추정 + 재고 관련 vocab 의 **단일 진실원천** (서버 소유).
 * persona.ts 와 같은 패턴 — 라벨·제한값을 앱에 하드코딩하지 않고 `GET /inventory/options` 로 내려준다.
 * 순수 로직이라 DB·LLM 없이 테스트된다.
 *
 * ⚠️ 값을 @companion/types 로 옮기지 말 것 — 그 패키지는 타입 전용이라 런타임 import 시
 * tsc·CI 는 통과하는데 서버 부팅이 죽는다 (백엔드 AGENTS.md 참고).
 */

/** 입력 제한 — DTO 검증과 클라 폼이 같은 값을 쓴다. 숫자를 DTO 에 직접 쓰지 말 것. */
export const LIMITS = {
  nameMax: 40,
  quantityNoteMax: 40,
  itemsMax: 30, // 한 번에 넣을 수 있는 재료 수 (LLM 이 폭주해도 상한)
};

/** 카테고리 값→라벨. vocab 은 문자열 유니온으로 좁히지 않는다(no-unsafe-enum-comparison 회피). */
export const CATEGORY_LABELS: Record<string, string> = {
  VEGETABLE: '채소',
  FRUIT: '과일',
  MEAT: '육류',
  SEAFOOD: '해산물',
  DAIRY: '유제품',
  EGG: '달걀',
  GRAIN: '곡물·면·빵',
  SAUCE: '양념·소스',
  PROCESSED: '가공식품',
  FROZEN: '냉동식품',
  ETC: '기타',
};

export const STORAGE_LABELS: Record<string, string> = {
  FRIDGE: '냉장',
  FREEZER: '냉동',
  PANTRY: '실온',
};

export const CATEGORY_VALUES = Object.keys(CATEGORY_LABELS);
export const STORAGE_VALUES = Object.keys(STORAGE_LABELS);

/**
 * `expirySource` 어휘의 단일 출처 (DTO 검증이 이걸 쓴다).
 *
 * ⚠️ **`NONE` 은 여기 없다** — 클라이언트가 보내는 값이 아니라 서버가 "날짜가 없다"에서 파생해
 * 쓰는 값이라서다. 받아주면 `expiresAt` 은 있는데 출처는 `NONE` 인 어긋난 행을 만들 수 있다.
 */
export const EXPIRY_SOURCE_INPUT_VALUES = ['USER', 'ESTIMATED'];

/**
 * 냉장 보관 기준 카테고리별 소비기한(일).
 *
 * ⚠️ **이 표는 이제 "기본값" 선택지의 재료일 뿐, 자동으로 채워지지 않는다.**
 * 예전엔 유저가 아무것도 안 넣어도 임박 정렬이 돌게 하려고 **저장할 때 서버가 이 값으로 폴백**했다.
 * 그런데 추정은 대체로 틀리는데 화면에서는 확정값과 구분이 안 됐고("쯤" 표기로는 부족했다),
 * 사용자는 사실 더 잘 알면서 입력이 귀찮아 안 넣을 뿐이었다. 그래서 **미설정(null)을 기본**으로
 * 바꿨고, 이 표는 사용자가 폼에서 "기본값"을 **고를 때만** 쓰인다.
 *
 * 그래서 정확도의 의미도 달라졌다 — 예전엔 "틀려도 없는 것보단 낫다"였지만, 지금은 사용자가
 * 이 값에 **동의해서 고른 것**이라 틀리면 그 신뢰를 깎는다.
 *
 * ⚠️ 개봉 후에는 표기일이 무의미해진다(우유는 개봉 시 2~3일). v1 은 여기까지 모델링하지 않는다 —
 * quantityNote 에 "개봉함" 을 적고 expiresAt 을 직접 당기는 것으로 충분하다.
 */
const FRIDGE_DAYS: Record<string, number> = {
  VEGETABLE: 7,
  FRUIT: 7,
  MEAT: 3,
  SEAFOOD: 2,
  DAIRY: 7,
  EGG: 21,
  GRAIN: 5, // 빵·생면 기준. 쌀 같은 건조 곡물은 PANTRY 로 들어가 훨씬 길어진다
  SAUCE: 180,
  PROCESSED: 90,
  FROZEN: 30, // 냉장에 둔 냉동식품 = 사실상 해동 상태라 짧게 본다
  ETC: 7,
};

/** 실온 보관 — 상하기 쉬운 건 더 짧고, 건조·가공품은 오히려 길다. */
const PANTRY_DAYS: Record<string, number> = {
  VEGETABLE: 3,
  FRUIT: 4,
  MEAT: 1, // 실온 육류는 사실상 당일. 경고 목적의 값
  SEAFOOD: 1,
  DAIRY: 1,
  EGG: 7,
  GRAIN: 180, // 쌀·건면·밀가루
  SAUCE: 365, // 미개봉 기준
  PROCESSED: 180,
  FROZEN: 1,
  ETC: 14,
};

/** 냉동 보관 — 카테고리 차이가 냉장만큼 크지 않아 배수 대신 고정값 위주로 둔다. */
const FREEZER_DAYS: Record<string, number> = {
  VEGETABLE: 180,
  FRUIT: 180,
  MEAT: 180,
  SEAFOOD: 90,
  DAIRY: 30,
  EGG: 30,
  GRAIN: 90,
  SAUCE: 365,
  PROCESSED: 180,
  FROZEN: 180,
  ETC: 90,
};

const TABLES: Record<string, Record<string, number>> = {
  FRIDGE: FRIDGE_DAYS,
  FREEZER: FREEZER_DAYS,
  PANTRY: PANTRY_DAYS,
};

const DEFAULT_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/** 카테고리×보관위치 → 소비기한 일수. 모르는 조합은 안전하게 짧은 기본값. */
export function shelfLifeDays(category: string, storage: string): number {
  return TABLES[storage]?.[category] ?? DEFAULT_DAYS;
}

/**
 * 등록 시점 기준 소비기한 추정 — "등록일 + `shelfLifeDays`" 가 전부다.
 *
 * ⚠️ **런타임 경로에서는 아무도 안 부른다. 그래도 지우지 말 것.**
 * 서버가 만료일을 추정하던 시절엔 저장 경로가 이 함수를 탔지만, 지금은 **앱이** 폼의 "기본값"을
 * 고를 때 `GET /inventory/options` 로 받은 같은 표(`TABLES`)로 같은 계산을 해서 날짜를 실어 보낸다.
 *
 * 남겨두는 이유는 둘이다:
 *  1. **그 계산의 참조 구현**이다 — 앱 쪽 계산이 의심스러우면 여기와 대조하면 된다.
 *  2. **자정 경계 계산을 검증하는 유일한 스펙**(`shelf-life.spec.ts`)이 이 함수를 대상으로 한다.
 *     앱엔 아직 테스트 러너가 없어서, 이걸 지우면 그 검증이 레포에서 통째로 사라진다.
 *
 * 앱에 테스트를 붙여 계산을 그쪽으로 옮기게 되면 그때 함께 정리한다.
 */
export function estimateExpiry(
  category: IngredientCategoryType,
  storage: StorageAreaType,
  addedAt: Date,
): Date {
  return new Date(addedAt.getTime() + shelfLifeDays(category, storage) * MS_PER_DAY);
}

/** `GET /inventory/options` 응답 — native 폼이 렌더할 선택지 + 입력 제한. */
export function inventoryOptions(): InventoryOptionsType {
  return {
    categories: CATEGORY_VALUES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
    storages: STORAGE_VALUES.map((value) => ({ value, label: STORAGE_LABELS[value] })),
    limits: { ...LIMITS },
    // estimateExpiry 와 같은 표를 내려줘 클라가 "기본값" 만료일을 미리 계산해 보여준다.
    shelfLife: { days: TABLES, defaultDays: DEFAULT_DAYS },
  };
}
