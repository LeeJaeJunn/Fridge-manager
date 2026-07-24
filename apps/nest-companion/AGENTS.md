# nest-companion (백엔드) 전용 지침

이 문서는 **NestJS 백엔드 전용** 규칙이다. 레포 전체 규칙은 루트 `AGENTS.md` 를 참고.

## LLM / 벤더 추상화

- 모든 LLM 호출은 `LlmService` 를 통한다. 다른 모듈(Conversation/Memory 등)은 `LlmService` 의 메서드만 쓰고 벤더(OpenAI)를 직접 알지 못한다.
- `openai` import(및 `openai/helpers/zod`)는 `src/llm/` 폴더 안에서만 한다. 벤더 응답(`res`)은 `llm/` 안에서 벤더 중립 타입(`ChatResType`/`StructuredResType<T>`)으로 변환해 반환한다.
- 세 메서드: `chat()` = 자유 텍스트, `structured<T>()` = 스키마 강제(JSON), `chatWithTools()` = 함수 호출(tool use). 구조화는 **zod 스키마**를 받아 `responses.parse` + `zodTextFormat` 로 **검증된** 객체를 돌려준다(`JSON.parse`/`as T` 캐스팅 없음). zod 스키마 자체는 openai 무관이라 도메인 모듈(예: `memory.prompt.ts`)에 둔다.
- `chatWithTools()`: 툴 정의(`LlmTool`, `parameters`는 JSON Schema)와 실행기(`LlmToolExecutor`)를 **호출자가 만들어 넘기면**, openai tool-call 루프(모델이 `tool_call` → 실행기 실행 → 결과 `function_call_output` 재주입 → 재호출)를 **`llm/` 안에서** 돈다. 툴 정의·실행기는 벤더 중립 타입이라 도메인(Conversation 등)이 소유하고 openai를 모른다. usage는 **모든 왕복 누적**, `maxRounds` 마지막 라운드는 `tool_choice:'none'`으로 텍스트 답을 강제(툴만 내다 빈 답 나가는 것 방지).
- 세 메서드 모두 반환에 **`usage`(토큰)** 를 담는다 — 지금은 소비처 없지만 나중에 어드민 사용량 표시/구독 쿼터용으로 수집.
- 모델명은 호출하는 쪽에서 파라미터로 넘긴다 (호출별로 다른 모델 사용 가능).
- 단, 채팅에 쓰는 모델은 **사용자/캐릭터가 정하지 않고 관리자 소유**다. `ConversationService` 가 `LLM_MODEL`(env)을 읽어 넘긴다. (나중에 Settings 테이블 + 관리자 페이지로 이전 예정)

## 에러 처리

- 컨트롤러/서비스를 try-catch 로 감싸지 않는다. 적절한 예외를 throw 하면 Nest 전역 예외 계층이 HTTP 응답으로 변환한다.
- 입력 검증 실패 등 알려진 조건 → `BadRequestException` / `NotFoundException` 등을 throw.
- 벤더(OpenAI) 호출 에러는 `LlmService` 안에서 try-catch 로 잡아 **로깅 + 의미있는 예외**(예: `ServiceUnavailableException`)로 변환한다. 벤더 에러(`APIError`)가 바깥 모듈로 새지 않게 한다.

## 보안 — 신뢰 경계 (trust boundary)

- **서버 동작을 결정하는 값(시스템 프롬프트/`instruction`, 사용할 `model`)은 서버 소유다. 클라이언트가 보내게 하지 않는다.**
- `instruction` 은 서버가 DB(유저의 Character 구조화 필드)에서 조립하고, `model` 은 env(`LLM_MODEL`)에서 해석한다. 클라이언트는 캐릭터 **설정값**(성별·관계·성격 등)은 보내지만 조립된 instruction·model 을 보내거나 고르게 하지 않는다. (프롬프트 조작·탈옥·모델 비용 악용 방지)
- 클라이언트에 내려주는 캐릭터 정보는 **표시용**(name 등)에 한정하고 `instruction`/`model` 은 노출하지 않는다.

## 캐릭터 데이터

캐릭터는 **"내 냉장고를 아는 요리 조력자"** 톤으로 축소된 얇은 페르소나다. 유저가 정하는 건 이름·말투·호칭뿐이고, 정체성(조력자)은 고정이다. 연인·성별·관계·상세 성격 필드는 제거됐다.

- **유저당 캐릭터는 하나다** (여러 개 중 선택이 아님). DB에서 `User` ↔ `Character` 1:1 (`Character.userId @unique`).
- 캐릭터의 구조화 필드는 `name`(필수) + `speechStyle`(온보딩 필수, `casual`/`formal`) + `userNickname`(선택)뿐이다. 전부 사용자가 정하고 `PATCH me` 로 부분수정한다.
- **`instruction`(시스템 프롬프트)은 저장하지 않는다** — 구조화 필드에서 **프롬프트 시점에 매번 조립**한다(`src/character/persona.ts` 의 `buildPersonaInstruction` = 고정 조력자 정체성 + 말투 + 대화 규칙(능동적 구조화 질문) + 가드레일, 단일 진실원천). 템플릿을 고치면 기존 캐릭터도 자동 반영. (신뢰 경계: 클라는 설정값을 보내지만 조립된 instruction/model 은 서버 소유·비노출.)
- `speechStyle` 은 안정적 키를 **String 컬럼**에 저장한다(DB enum 회피). 값→한국어 라벨, 선택지 vocab(말투/온보딩 태그), **입력 제한값(`LIMITS`)** 은 전부 **`persona.ts` 가 소유**하고 `GET options` 로 native 에 내려준다. DTO 검증(@IsIn/@MaxLength)도 같은 상수를 쓴다 — **DTO 에 숫자를 직접 쓰지 말 것**(숫자가 두 곳에 박히면 한쪽만 고쳐 어긋난다).
- **클라 검증은 UX, 서버 검증이 방어다.** 앱은 신뢰 경계 밖이라 curl 로 바로 API 를 때릴 수 있고, 온보딩 태그는 메모리로 시드돼 프롬프트에 들어간다 → `@IsIn(TAG_VALUES)` 를 빼면 임의 문자열이 프롬프트에 섞인다. 클라 제한은 "미리 알려주기"일 뿐 자물쇠가 아니다.
- ⚠️ **vocab·제한값을 `@companion/types` 에 상수로 옮기지 말 것.** 그 패키지는 타입 전용(런타임 엔트리 없음)이라 값을 import 하면 **tsc·CI 는 통과하는데 서버 부팅이 죽는다**(`ERR_PACKAGE_PATH_NOT_EXPORTED`). 실제로 확인함. 값은 API 로 내려주는 게 정답이고, 덤으로 앱 배포 없이 vocab·제한을 바꿀 수 있다. ⚠️ vocab 은 문자열-리터럴 유니온으로 좁히지 말 것(`as const` 금지) — `===`/`!==` 비교 시 `no-unsafe-enum-comparison` 규칙이 크래시한다. 같은 이유로 이 레포는 `x !== undefined` 대신 `typeof x !== 'undefined'` 를 쓴다.
- **온보딩 태그는 캐릭터가 아니라 유저 정보**다 → 생성 시 **Memory row 로 시드**한다(캐릭터·태그 생성을 한 `$transaction`). 태그는 **세 그룹**이고 그룹마다 카테고리·중요도가 다르다 — 식성→`PREFERENCE`, **알레르기→`PROFILE`(importance 3, 안전)**, 조리도구→`OWNERSHIP`. 매핑은 `persona.ts` 의 `TAG_GROUPS`/`tagToMemory` 가 소유하고, 요청 내 중복은 서비스에서 제거한다. recall 주입/표시 파이프라인을 그대로 타서 첫 대화부터 작동하고, 관리(삭제)는 메모리 API 로 한다. 캐릭터엔 태그 컬럼이 없다.
- **파생 데이터는 저장하지 않는다.** `model` 도 캐릭터 데이터가 아니다(관리자 소유, env `LLM_MODEL`).
- API는 `src/character/` (`CharacterModule`): `GET options`(선택지 vocab + 태그 그룹), `GET me`, `POST`(name·speechStyle·userNickname·tags 로 생성), `PATCH me`(부분수정), `DELETE me`. 표시용 필드만 내려주고 `instruction`/`model` 은 노출하지 않는다.

## 대화 저장 (Conversation)

- 채팅은 **DB에 저장되는 대화**다. `src/conversation/` (`ConversationModule`)가 담당하며, 채팅의 정식 경로다. (구 stateless `src/chat/` 모듈은 제거됨 — conversation이 유일한 채팅 경로다.)
- 데이터: `Conversation`(유저당 N개) ↔ `Message`(role `user|assistant`). 대화 목록은 `updatedAt desc` 정렬 + 마지막 메시지 preview.
- API는 전부 **현재 유저 기준**이고 소유권 격리가 핵심 — 조회/수정/삭제는 항상 `where: { ..., userId }` 로 본인 것만 만진다 (남의 대화 접근 시 `NotFoundException`, 삭제는 `deleteMany`로 멱등).
  - `GET /conversations`(목록), `GET /conversations/:id`(상세+메시지), `POST /conversations`(첫 메시지로 **지연 생성**), `POST /conversations/:id/messages`(이어가기), `DELETE /conversations/:id`, `DELETE /conversations/:id/messages/:messageId`.
- **지연 생성(lazy)**: "새 채팅" 버튼은 빈 화면만 열고, 첫 메시지를 보낼 때 비로소 `Conversation` 을 만든다 (빈 대화가 DB에 안 쌓이게).
- 매 교환마다 서버가 DB에서 **해당 대화의 전체 히스토리를 읽어** LLM에 넘긴다. 히스토리·instruction을 클라이언트가 보내지 않는다(신뢰 경계).
- 최종 instruction 은 `buildInstruction` 이 조립한다: 캐릭터 이름 + **유저 이름** + **장기 메모리(`MemoryService.recall`)** + **냉장고 재고(`InventoryService.recall`)** + 캐릭터 페르소나 + 레시피 지침 + **알레르기 경고**. 순서 통제는 `buildInstruction` 한 곳에 있다.
  - **재고 주입**: 재료마다 **남은 일수를 서버가 계산해** 넣는다(`- 대파 · 내일까지`). 모델은 오늘 날짜를 모르거나 틀리게 알아서 날짜만 주면 "곧 상해요" 판단을 못 한다. 추정 만료일은 "쯤"으로 흐린다. 비면 "재료 없음"을 명시해 모델이 지어내지 않게 한다.
  - **알레르기 안전**: 알레르기·못 먹는 것은 `splitAllergies` 로 떼어 **맨 끝 경고 블록** + **재고 목록 인라인 표시** 이중으로 넣는다. 중간에 두면 "임박한 재료 먼저" 지침에 밀려 실제로 알레르기 재료를 1순위 추천하는 걸 확인했다. 순수 함수(`splitAllergies`/`formatInventory`/`daysLeft`)라 `conversation.prompt.spec.ts` 로 고정한다.
- 매 교환 후 **N메시지마다 백그라운드로 메모리를 추출**한다(`MEMORY_EXTRACT_EVERY_N`). 판단은 반환된 `messageCount`(= 이미 읽은 히스토리 길이 + 1)로 하며 **별도 count 쿼리를 하지 않는다**.
- nested write 만 하면 `@updatedAt` 이 안 올라가므로 답변 저장 시 `updatedAt: new Date()` 를 명시 갱신한다(목록 최근순 정렬용).
- **냉장고 툴(대화 중)**: `exchangeWithTools` 가 `chatWithTools` 로 툴 두 개를 붙여 대화한다.
  - `add_ingredients` — "계란 샀어" 같은 말에서 재료를 뽑아 재고에 넣는다(만료일 폴백·중복 병합은 `InventoryService` 가 흡수). 이게 주 입력 경로다.
  - `consume_ingredients` — 실제로 먹었다고 할 때만 소비 처리. **얼마 썼는지가 아니라 뭐가 남았는지**(`remaining`)를 받아 부분 소비를 표현한다(산수는 재고를 프롬프트로 받은 모델이 하고 서버는 결과만 저장). 자동 차감은 틀리면 신뢰를 깎으므로 description 으로 못박는다.
- **상품추천은 v1.2 대기**: `search_products` 툴·`PRODUCT_RECO_GUIDANCE`·실행기·`Message.products` 스냅샷 저장·`Conversation.lastSearch` 커서 페이징이 전부 코드에 **살아 있고 등록만 빠져 있다**(툴 배열에서 제외). 부족 재료 쇼핑을 붙일 때 툴 배열에 다시 넣으면 된다. `search_products` / `PRODUCT_RECO_GUIDANCE` 는 그때까지 `eslint-disable`(no-unused-vars) 로 표시돼 있다.

## 장기 메모리 (Memory)

- 간판 기능 — "나를 기억하는 AI". `src/memory/`(`MemoryModule`). 대화에서 지속적 사실(식성·알레르기·조리도구·요리성향)을 뽑아 저장하고 다음 대화 프롬프트에 주입한다. **재고와 역할이 다르다** — 메모리는 "사람에 묶이는 지속 정보", 재고(`Ingredient`)는 "계속 변하는 상태". 아래 "냉장고 재고" 참고.
- **주입(recall)과 표시(list)를 분리한다**:
  - `recall(userId)` = "프롬프트에 넣을 메모리 선택" — **벡터 교체 seam**이다. 지금은 importance 순 전부. 수가 많아지면 이 메서드 **내부만** top-N(importance) → 유사도 top-k(pgvector `vector` 컬럼 추가)로 바꾼다. 호출자(Conversation)는 안 바뀐다.
  - `list(userId)` = "AI가 기억하는 나" 화면용 — 항상 전부(+`id` 포함, 삭제용).
- **추출(extractMemory)**: `ConversationService` 가 N메시지마다 **fire-and-forget** 호출(응답 지연 0). 최근 window개 메시지 → 기존 메모리와 함께 LLM 구조화 추출(`structured`) → 새 사실만 저장.
  - 방침: **지속적 사실만**(일회성 이벤트/약속 제외), **추가만**(갱신·모순 해결 안 함 — 사용자가 삭제로 교정), 중복은 **LLM(의미) + 코드(정확일치) 2중** 제거.
  - ⚠️ **재료 재고는 뽑지 않는다** — "계란 있음"은 냉장고(`Ingredient`)가 관리하고 메모리에 또 저장하면 두 기록이 어긋난다. 추출 지침 맨 앞에서 `"계란 알레르기가 있음"`(사람) vs `"계란 있음"`(재고)을 구분하라고 못박는다. 알레르기는 안전 문제라 `importance` 3 을 강제한다.
  - 프롬프트·zod 스키마는 `memory.prompt.ts`(순수). category는 enum 강제, importance는 1~3 코드 클램프.
  - 백그라운드라 `extractMemory` 안에서 try/catch 로 에러를 삼키고 로깅만 한다 (위 "에러 처리" 원칙의 **의도적 예외** — 채팅 응답에 영향 0).
- 데이터: `Memory`(userId, `category`=`MemoryCategory` enum 4개 — `PREFERENCE`(식성)/`PROFILE`(알레르기·체질·요리성향)/`OWNERSHIP`(조리도구)/`ETC`, content, importance). content는 짧은 사실 1개 = row 1개, 주입·표시 겸용.
- **벡터는 지금 안 넣는다**: 메모리 소수라 전부 주입이 더 싸고 정확. recall seam + 루트 AGENTS.md 방침 덕에 나중에 컬럼 추가 + recall 내부 교체로 붙는다.
- 튜닝 env(나중에 Settings 테이블로 이전): `MEMORY_EXTRACT_WINDOW`, `MEMORY_EXTRACT_EVERY_N`, `MEMORY_EXTRACT_MODEL`(비우면 `LLM_MODEL`). 읽는 곳은 서비스 생성자 **1곳**(env→DB 전환 seam).
- API(`MemoryModule`): `GET /memories`(내 전체), `DELETE /memories/:id`(교정용, 본인 것만 멱등). 전부 현재 유저 기준.

## 냉장고 재고 (Inventory)

- v1 핵심 기능. `src/inventory/`(`InventoryModule`). **메모리와 달리 별도 테이블(`Ingredient`)** 이다 — 상태가 계속 변하고 "유통기한 임박" 같은 날짜 쿼리가 필요해서 자유텍스트로는 둘 다 안 된다.
- **쿼리가 필요한 것만 구조화**한다: `name`(정규화, 레시피 매칭·중복 판정), `category`(소비기한 추정·그룹핑), `expiresAt`, `consumedAt`. 수량은 `quantityNote` **자유텍스트**다 — 앱은 실제 소비를 관찰 못 해서(김치찌개 하나에 대파가 몇 단 줄었는지 모른다) 숫자를 들고 있어도 금방 허구가 되고, 틀린 숫자는 신뢰를 깎는다.
- **`expiresAt` 은 쓸 때 폴백해서 항상 채운다**(nullable 아님): 유저가 표기일을 주면 그 값(`expirySource=USER`), 모르면 `shelf-life.ts` 의 카테고리×보관위치 추정(`ESTIMATED`). 읽을 때 분기하면 "곧 상하는 것" 조회·정렬 경로가 전부 분기를 떠안으므로 쓸 때 한 번 채운다. UI 는 `expirySource` 로 "8/12까지" vs "8/12쯤"을 가른다.
- **soft delete**: `consume` 은 삭제가 아니라 `consumedAt` 을 찍는다. 모든 조회에 `consumedAt: null` 이 붙어(list/recall/expiringSoon/중복검사) 먹은 재료가 목록·프롬프트에서 빠진다 — `recall` 이 유령 재료를 흘리지 않는지 테스트로 고정. 되돌리기(`restore`)가 UPDATE 한 번이고, 소비 이력은 나중에 "자주 사는 재료" 근거가 된다. 잘못 등록한 건 `DELETE :id/hard` 로 진짜 지운다("다 먹음"과 "잘못 등록"은 의미가 달라 이력에 남길지가 갈린다).
- **병합**: 같은 이름을 다시 넣으면 새 row 가 아니라 기존 미소비 재고에 병합한다. 만료일·보관·분류는 **새로 넣은 값으로 갱신**한다(재입고 = 방금 산 게 주). 수량을 개별 추적하지 않으므로 옛 재고 기준으로 잡을 근거가 없다. 수량 메모는 이번에 안 적었으면 기존 표시를 유지.
- `shelf-life.ts` = 소비기한 추정 + 카테고리·보관위치 vocab·라벨·`LIMITS` 의 **단일 진실원천**(persona.ts 와 같은 패턴, `GET /inventory/options` 로 내려줌). 순수 로직이라 DB·LLM 없이 테스트된다.
- 채팅 툴(`add_ingredients`/`consume_ingredients`)이 `InventoryService` 를 **직접** 호출한다(HTTP 안 탐). 아래 컨트롤러는 냉장고 화면의 **수동 교정 경로**다.
- API(`InventoryModule`, 전부 현재 유저 기준): `GET /inventory`(임박순), `GET /inventory/expiring?days=N`(홈 "먼저 먹어요"), `GET /inventory/options`, `POST /inventory`(여러 건), `PATCH /inventory/:id`(교정 — 만료일 직접 고치면 `USER` 승격, 표기일 없이 분류·보관만 바꾸면 만료일 재추정. 유통기한 직접 편집이 없는 앱에선 보관 변경이 유일한 간접 조정 수단), `DELETE /inventory/:id`(=consume, soft), `POST /inventory/:id/restore`, `DELETE /inventory/:id/hard`. `:id` 라우트는 반드시 리터럴 경로(`options`/`expiring`) **아래**에 둔다(Nest 는 선언순 매칭).

## 커머스 — 상품 검색 (Commerce, v1.2 대기)

- ⚠️ **부족 재료 쇼핑 추천(v1.2)용으로 코드는 완성돼 있고 채팅 등록만 빠져 있다**(위 Conversation 참고). 아래는 그 검색 계층 설명이다.
- `src/commerce/`(`CommerceModule`). `CommerceService.search(criteria)` 가 **네이버 쇼핑검색 API**를 호출해 **정규화된 `ProductType[]`**(packages/types) 로 반환한다.
- **벤더(네이버) 격리**: 네이버 원본(HTML `<b>` title, 문자열 `lprice`, `category1~4`)과 호출 에러는 이 서비스 안에서 흡수해 `ProductType` 으로 변환한다 — `openai` 가 `llm/`에 갇히듯 **naver는 `commerce/`에만** 안다. 소비처(Conversation)는 `ProductType` 만 본다.
- **catalog 아니라 search seam**: 실제 커머스 API는 "우리 소유 카탈로그"가 아니라 검색 엔드포인트다. 그래서 `search(criteria)` 형태로 모델링. 프로바이더가 **2개 이상(쿠팡/아마존)** 되면 그때 인터페이스+DI토큰으로 분리한다 — 지금은 단일이라 안 만든다(과한 추상화 지양).
- **정규화 타입은 공통분모 + 옵셔널 신호**: `ProductType` 은 세 API 공통분모(id·title·price·currency·imageUrl·productUrl·mall·brand·category). `rating?`/`reviewCount?`/`isRocket?` 는 옵셔널 — 프로바이더별로 있는 것만 채우고 소비처는 present 필드만 쓴다.
- **필터·페이징**: 네이버는 `sort`(정확도/가격/날짜)만 있고 가격·카테고리 필터 파라미터가 없어 **후처리**한다. `start`(1~1000)·`display`(≤100)는 **독립 제약**(합계 제한 없음). `search` 는 raw 를 스캔하며 필터 통과분을 `limit` 까지 모으고 **커서(`nextStart`)를 실제 스캔한 raw 개수만큼만 전진**(slice 유실·중복 방지). `ProductSearchResultType`(products·nextStart·hasMore) 반환, 클라는 `nextStart` 를 opaque 커서로 에코백(무상태).
- **호출량**: 네이버 쿼터는 호출 1회 = 1카운트(개수 무관). 페이징 절약이 필요하면 나중에 **배치 캐싱**(한 번에 받아 캐시에서 페이지 서빙) — 지금은 무상태라 잉여분 재사용 안 됨.
- `GET /products` 는 **임시 테스트용**(LLM 없음). 정식 소비 경로는 채팅 tool-use(위 Conversation "상품추천은 v1.2 대기").

## 인증 — 로그인(JWT access + refresh)

- `src/auth/`(`AuthModule`, `@Global`). loginId/password 로그인 + JWT 기반 세션.
- **토큰 2종**:
  - **access token** = JWT(서명, payload `{ sub: userId, type:'access', iss:'companion' }`), 짧은 수명(`JWT_ACCESS_TTL`, 기본 15분). 모든 API 요청의 `Authorization: Bearer` 로 사용. `JwtAuthGuard` 가 서명·만료·`issuer` 를 검증하고 **payload 형태도 런타임 확인**(`sub` 가 비어있지 않은 문자열 + `type==='access'`)한 뒤 `req.userId` 에 심는다. (서명만 통과한 이상 토큰이 `req.userId=undefined` 로 흘러 소유권 쿼리를 오작동시키는 것 방지)
  - **refresh token** = 랜덤 문자열(hex 64자), 긴 수명(`REFRESH_TTL_DAYS`, 기본 30일). access 재발급(`POST /auth/refresh`)에만 쓰고 일반 API엔 안 쓴다. 원문은 저장하지 않고 **sha256 해시만** `RefreshSession` 에 저장(DB 유출 시 원문 복원 방지).
- `@CurrentUser()` 데코레이터로 컨트롤러에서 `req.userId` 를 꺼낸다. 모든 유저 스코프 라우트는 이 값 기준. (가드가 `DevAuthGuard`→`JwtAuthGuard` 로 바뀌었지만 `req.userId` 계약이 같아 컨트롤러/서비스는 무변경.)
- **회전(rotation)은 원자적**: `refresh` 는 옛 세션 삭제+새 세션 생성을 **`$transaction` 으로 묶고 `deleteMany` 의 count가 정확히 1일 때만** 성공시킨다 → 같은 refresh 로 동시 요청이 와도 진 쪽은 count 0 → 재사용 401(500 아님). 탈취된 옛 refresh 재사용도 401. **로그아웃**(`POST /auth/logout`)은 해당 refresh 세션을 삭제(멱등).
- **AuthService**:
  - `signup` — 유저 생성 + 최초 세션을 **한 트랜잭션**으로(반쪽 가입 방지). 중복은 사전조회 없이 **unique 제약(P2002)→`ConflictException`** (동시 가입 경합도 안전).
  - `login` — 유저가 없어도 **더미 해시로 `bcrypt.compare` 를 수행**(계정 열거 타이밍 공격 방지), 실패 메시지도 동일. 성공 시 만료된 세션을 기회적으로 정리.
  - `getCurrentUser`(=`GET /auth/me` 로직), `refresh`, `logout`. bcrypt 는 순수 JS `bcryptjs`.
- API: `POST /auth/signup|login|refresh|logout`(가드 없음), `GET /auth/me`(`JwtAuthGuard`). signup/login 은 `{ accessToken, refreshToken, user }` 반환.
- env: `JWT_SECRET`(≥16자, 프로덕션은 무작위로 교체 필수), `JWT_ACCESS_TTL`, `REFRESH_TTL_DAYS`. **시작 시 `config/env.validation.ts`(zod, `ConfigModule.validate`)로 검증** — 빈 secret·NaN TTL·프로덕션의 `change-me` 면 부팅을 차단한다. `JwtModule` 은 `global: true` 로 등록해 각 모듈의 `@UseGuards(JwtAuthGuard)` 가 `JwtService` 를 주입받게 한다.
- 데이터: `RefreshSession`(userId, `tokenHash` @unique, expiresAt). `User` 에 이미 `loginId`/`passwordHash` 존재.
- **미구현(배포 전)**: 로그인/회원가입 rate limit(`@nestjs/throttler`) — 브루트포스·bcrypt CPU 소모 방어.

## DB / Prisma

- **Postgres + Prisma 7** (`prisma-client` generator + `@prisma/adapter-pg` 드라이버 어댑터).
- 로컬 DB: `docker compose up -d` (`docker-compose.yml`, `pgvector/pgvector:0.8.3-pg18`). 프로덕션은 `DATABASE_URL` 만 관리형 DB로 교체.
- 스키마는 `prisma/schema.prisma`. 작업 명령:
  - `pnpm db:migrate` (= `prisma migrate dev`) — 스키마 변경 후 마이그레이션 생성·적용
  - `pnpm db:generate` — 클라이언트 재생성 (clone 직후엔 필수 — `src/generated/` 는 gitignore)
  - `pnpm db:studio` — DB GUI
- DB 접근은 `PrismaService`(전역 `PrismaModule`)를 주입해서 한다. `PrismaService` 는 `PrismaClient` 상속 + 어댑터 연결.
- **반드시 지킬 설정 (어기면 빌드/런타임 깨짐):**
  - generator `moduleFormat = "cjs"` — NestJS는 CommonJS다. 빼면 ESM(`import.meta`)으로 생성돼 컴파일이 깨진다.
  - 클라이언트 `output` 은 `src/generated/prisma` (= `src/` 안), 그리고 `prisma.config.ts` 는 `tsconfig.build.json` 의 `exclude` 에 둔다. 안 그러면 빌드 산출물이 밀려 `dist/main.js` 가 `dist/src/...` 로 이동한다.
  - `migrate dev` 는 generate를 자동 실행하지 않는다. 그래서 `build` 스크립트가 `prisma generate && nest build` 로 generate를 먼저 돌린다.
  - env 로딩: 런타임은 `@nestjs/config`, Prisma CLI는 `prisma.config.ts` 의 `dotenv` 로 각각 `DATABASE_URL` 을 읽는다 (Prisma 7은 `.env` 자동 로드 안 함).
  - **Jest + Prisma 7**: 생성된 클라이언트가 `.ts` 안에서 `./internal/class.js` 처럼 **명시적 `.js` 확장자**로 import 해서, ts-jest 가 해석을 못 한다. 두 jest 설정(유닛=`package.json` 의 `jest`, e2e=`test/jest-e2e.json`) 모두에 `moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" }` 가 있어야 `PrismaService` 를 import 하는 테스트가 돈다(없으면 테스트 0 실행). e2e 는 `PrismaService` 를 `overrideProvider` 로 mock 하므로 실제 DB 없이 부팅만 검증한다.

## 테스트 / CI

- 유닛 테스트는 `*.spec.ts`(예: `auth.service.spec.ts`) — 서비스 로직만 떼어 Prisma/JWT 를 mock 해 검증(런타임 코드 아님, 빌드 산출물 미포함). e2e 는 `test/*.e2e-spec.ts`.
- `lint` 는 **검사만**(`--fix` 없음), 자동수정은 `lint:fix`. CI 가 위반을 잡아야 하므로 둘을 분리한다.
- 레포 루트 `pnpm verify` = `format:check → lint → test → test:e2e → build`. **push 전에 이걸 돌린다.** CI(`.github/workflows/ci.yml`)도 동일 체인 + 더미 env(로컬 `.env` 없이 부팅되도록)로 실행한다.
- 테스트에서 `expect(p).rejects.toBeInstanceOf(X)` 쓸 때 `X`(예외 클래스)를 **반드시 import** — 안 하면 `toBeInstanceOf(undefined)` 가 동기 throw → 미처리 rejection 으로 Node 가 워커를 죽인다.

## 개발 워크플로우 주의

- 개발 서버는 `pnpm start:dev`(`nest start --watch`). 끄면 4000 포트가 닫혀 native가 `ERR_CONNECTION_REFUSED` 를 받는다 — 권한 문제가 아니라 백엔드가 안 떠 있는 것.
- 가끔 `Cannot find module './app.module'` 로 죽었다 살아나는 건 **watch 재빌드 도중의 빈 창** 때문이다: `deleteOutDir`(nest-cli) 가 dist를 통째로 비우고 다시 컴파일하는 사이 `main.js` 는 있는데 `app.module.js` 가 아직 없는 타이밍에 재시작되면 크래시 → 빌드 끝나면 복구. **배포(한 번 build → `node dist/main`)에는 없는 문제**다.
  - 특히 watch가 도는 중 `prisma generate`/`pnpm db:migrate` 를 돌리면 `src/generated/prisma` 무더기 변경으로 재빌드 폭풍이 나서 잘 터진다 → **watch를 끈 상태에서** generate/migrate 하는 걸 권장.
  - 정 거슬리면 `nest-cli.json` 의 `deleteOutDir: false`(제자리 덮어쓰기로 빈 창 제거) 옵션도 가능. 필수는 아님.
