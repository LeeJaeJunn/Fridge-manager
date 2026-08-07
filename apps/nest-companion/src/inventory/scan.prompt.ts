/**
 * 영수증·사진에서 식재료를 뽑는 프롬프트와 스키마 (순수 — Nest·LLM 무관).
 * `memory.prompt.ts` 와 같은 패턴이라 `scan.prompt.spec.ts` 로 고정된다.
 *
 * 뽑은 결과는 **그대로 저장하지 않는다** — `InventoryService.previewAdd` 가 기본값·만료일 추정을 얹어
 * 확인 카드용 제안으로 바꾸고, 사용자가 확인해야 반영된다(채팅 툴과 같은 방침).
 */

import { z } from 'zod';
import { CATEGORY_VALUES, LIMITS, STORAGE_VALUES } from './shelf-life';

export const RECEIPT_SCHEMA_NAME = 'receipt_scan';

/**
 * 스캔 종류 vocab — DTO 검증(@IsIn)이 쓰는 **런타임 값**이다.
 * 타입(`ScanKindType`)은 `@companion/types` 에 있고 여기 값과 짝을 이룬다
 * (그 패키지는 타입 전용이라 값을 넣으면 서버 부팅이 깨진다 — persona.ts 와 같은 이유).
 * ⚠️ `as const` 로 좁히지 않는다 (no-unsafe-enum-comparison 회피, 레포 방침).
 */
export const SCAN_KINDS: string[] = ['receipt', 'photo'];

/**
 * ⚠️ 전부 **required + nullable** 이다. OpenAI Structured Outputs 는 모든 속성이 required 여야 해서
 * zod `.optional()` 은 쓸 수 없다 — "없음"은 `null` 로 표현하고, 서버가 `undefined` 로 바꿔 넘긴다.
 *
 * enum 값은 `shelf-life.ts` 가 단일 진실원천이다. `CATEGORY_VALUES` 는 `string[]` 이라
 * z.enum 이 요구하는 튜플로 단언해서 넘긴다 (vocab 을 `as const` 로 좁히지 않는 레포 방침 유지).
 */
export const ScanSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      category: z.enum(CATEGORY_VALUES as [string, ...string[]]),
      /** 이번에 산 양 (영수증 표기 그대로) */
      quantityNote: z.string().nullable(),
      /** 같은 재료가 이미 냉장고에 있을 때, 기존 수량과 합친 총량. 없으면 null */
      mergedQuantityNote: z.string().nullable(),
      storage: z.enum(STORAGE_VALUES as [string, ...string[]]).nullable(),
      expiresAt: z.string().nullable(),
    }),
  ),
});

export type ScanExtraction = z.infer<typeof ScanSchema>;

/**
 * 영수증 전용 instruction.
 *
 * 입력은 **영수증 사진**이고, OCR 텍스트가 함께 올 수도 있다(둘 다 같은 영수증이다).
 * 각자 잘하는 게 달라서 우선순위를 못박아 둔다 — OCR 은 글자를, 이미지는 표의 구조를 잘 안다.
 */
export const RECEIPT_INSTRUCTION = `너는 한국 마트·편의점 영수증에서 **식재료만** 뽑아 냉장고 재고 등록 목록을 만드는 추출기다.

[입력]
영수증 사진이 주어진다. OCR 로 읽은 텍스트와 **지금 냉장고에 있는 재료 목록**이 함께 주어질 수 있다.
- **품명의 글자**는 OCR 텍스트를 우선해라 (문자 정확도가 더 높다).
- **수량·열 구분·어떤 줄이 한 품목인지**는 이미지를 우선해라 (OCR 텍스트는 열이 뒤섞일 수 있다).
- 둘이 어긋나면 이미지로 판정해라. OCR 텍스트가 없으면 이미지만으로 판단해라.
- 냉장고 목록은 **합산에만** 쓴다. 거기 있는 재료를 영수증에 없는데 뽑아내지 마라.

[뽑을 것 / 버릴 것]
- 뽑는다: 먹을 수 있는 식재료·식품 (신선식품, 가공식품, 음료, 양념, 냉동식품)
- 버린다: 비식품(휴지·세제·비닐봉투·주방용품), 봉투값·보증금,
  그리고 합계·할인·적립·카드승인·사업자번호·매장명·날짜 등 품목이 아닌 줄
- 애매하면 버려라. 잘못 들어간 재료보다 빠진 재료가 낫다 (사용자가 다음 화면에서 확인·수정한다).

[name — 재료명 정규화]
영수증 표기를 **짧은 일반명**으로 바꾼다. 브랜드·용량·행사문구·규격을 전부 떼라.
- "무항생제특란20구" → "계란"
- "1등급우유930ML" → "우유"
- "국내산삼겹살(냉장)100g당" → "삼겹살"
- "[행사]종가집김치500G" → "김치"
단, 그 이름이 곧 재료인 가공식품은 상품명을 남긴다 ("신라면", "햇반", "스팸").
같은 재료가 여러 줄에 나오면 하나로 합쳐라.

[category — 반드시 다음 중 하나]
VEGETABLE(채소) FRUIT(과일) MEAT(육류) SEAFOOD(해산물) DAIRY(유제품) EGG(달걀)
GRAIN(곡물·면·빵) SAUCE(양념·소스) PROCESSED(가공식품) FROZEN(냉동식품) ETC(기타)
- 소비기한 추정에 쓰이니 되도록 정확히 채워라. 정말 모르겠으면 ETC.
- "냉동" 표기가 있어도 **재료 본래 분류를 우선**하고 storage 로 냉동을 표현해라
  (예: "냉동삼겹살" → category=MEAT, storage=FREEZER).

[quantityNote — **이번에 산 양**, 사람이 쓴 표현 그대로, 없으면 null]
- 숫자로 환산하지 마라. 앱은 실제 소비를 관찰하지 못해서 계산된 숫자는 금방 허구가 된다.
- **포장 규격과 구매 수량은 다르다.** 둘 다 있으면 둘 다 남겨라.
  예: "신라면멀티5입"을 2개 샀으면 → "5입 2봉" (10개로 바꾸지 마라)
- 가격은 절대 넣지 마라.

[mergedQuantityNote — 기존 재고와 합친 **총량**, 해당 없으면 null]
- 냉장고 목록에 **같은 재료가 이미 있을 때만** 채운다. 없으면 반드시 null.
- 기존 수량 + 이번에 산 양을 사람이 읽을 표현으로 합쳐라.
  예: 냉장고 "앞다리살 (4개)" + 이번 "10개" → "14개"
  예: 냉장고 "계란 (한 판)" + 이번 "20구" → "한 판 + 20구"
- **단위가 달라 더할 수 없으면 억지로 계산하지 말고 둘을 나란히 적어라**("한 판 + 20구").
  틀린 숫자는 없는 것보다 나쁘다.
- 기존 수량을 모르면(목록에 수량 표기가 없으면) null 로 두고 quantityNote 만 채워라.

[storage — 확실할 때만, 아니면 null]
- FREEZER: 냉동식품이거나 "냉동" 표기가 있을 때
- PANTRY: 라면·통조림·즉석밥·양념처럼 상온 보관이 명백할 때
- 그 외에는 null (서버 기본값이 냉장이다)

[expiresAt — 거의 항상 null]
- 영수증에 **소비기한/유통기한이 명시된 경우에만** ISO 날짜(YYYY-MM-DD).
- ⚠️ **영수증의 구매일자는 유통기한이 아니다.** 절대 그 날짜로 채우지 마라.
- 모르면 null. 서버가 재료 분류로 추정한다. 지어내지 마라.

[판독]
- 글자가 흐리거나 잘려 확신이 안 서는 줄은 버려라. 추측해서 만들어내지 마라.
- 식재료가 하나도 없거나 영수증이 아니면 **빈 배열**을 반환해라. 그게 정상적인 결과다.
- 최대 ${LIMITS.itemsMax}개까지만 반환해라.`;
