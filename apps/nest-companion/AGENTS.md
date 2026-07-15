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

- **유저당 캐릭터는 하나다** (여러 개 중 선택이 아님). DB에서 `User` ↔ `Character` 1:1 (`Character.userId @unique`).
- 캐릭터는 **구조화 필드**로 상세 설정한다: `name`(필수) + `gender`/`relationship`/`personality[]`/`speechStyle`(온보딩 필수) + `age`/`job`/`actingRule`(≤100자)/`userNickname`(선택). 전부 사용자가 정하고 `PATCH me` 로 부분수정한다.
- **`instruction`(시스템 프롬프트)은 저장하지 않는다** — 구조화 필드에서 **프롬프트 시점에 매번 조립**한다(`src/character/persona.ts` 의 `buildPersonaInstruction`, 단일 진실원천). 템플릿을 고치면 기존 캐릭터도 자동 반영. (신뢰 경계: 클라는 설정값을 보내지만 조립된 instruction/model 은 서버 소유·비노출.)
- `gender`/`relationship`/`speechStyle` 은 안정적 키를 **String 컬럼**에 저장한다(관계가 나중에 freeform 될 걸 대비해 DB enum 회피). 값→한국어 라벨, 선택지 vocab(성격/관심사), **입력 제한값(`LIMITS`)** 은 전부 **`persona.ts` 가 소유**하고 `GET options` 로 native 에 내려준다. DTO 검증(@IsIn/@MaxLength/@Min/@Max)도 같은 상수를 쓴다 — **DTO 에 숫자를 직접 쓰지 말 것**(숫자가 두 곳에 박히면 한쪽만 고쳐 어긋난다. 실제로 age 가 그렇게 어긋났었다).
- **클라 검증은 UX, 서버 검증이 방어다.** 앱은 신뢰 경계 밖이라 curl 로 바로 API 를 때릴 수 있고, `personality`/`actingRule` 은 시스템 프롬프트에 그대로 들어간다 → `@IsIn`·`@MaxLength` 를 빼면 프롬프트 조작·토큰 비용 악용이 열린다. 클라 제한은 "미리 알려주기"일 뿐 자물쇠가 아니다.
- ⚠️ **vocab·제한값을 `@companion/types` 에 상수로 옮기지 말 것.** 그 패키지는 타입 전용(런타임 엔트리 없음)이라 값을 import 하면 **tsc·CI 는 통과하는데 서버 부팅이 죽는다**(`ERR_PACKAGE_PATH_NOT_EXPORTED`). 실제로 확인함. 값은 API 로 내려주는 게 정답이고, 덤으로 앱 배포 없이 vocab·제한을 바꿀 수 있다. ⚠️ vocab 은 문자열-리터럴 유니온으로 좁히지 말 것(`as const` 금지) — `===`/`!==` 비교 시 `no-unsafe-enum-comparison` 규칙이 크래시한다. 같은 이유로 이 레포는 `x !== undefined` 대신 `typeof x !== 'undefined'` 를 쓴다.
- **유저 관심사는 캐릭터가 아니라 유저 취향**이다 → 생성 시 `category=INTEREST` **Memory row 로 시드**한다(캐릭터·관심사 생성을 한 `$transaction`). 기존 recall 주입/표시 파이프라인을 그대로 타서 첫 대화부터 "나를 기억하는 AI" 로 작동하고, 관리(삭제)는 메모리 API 로 한다. 캐릭터엔 관심사 컬럼이 없다.
- **파생 데이터는 저장하지 않는다.** instruction 과 같은 이유로 `description`(카드 한 줄 소개)도 없앴다 — 관계·성격을 이어붙인 파생 문자열이라 staleness 만 생기고, 클라가 이미 가진 `relationship`/`personality`(+`GET options` 라벨)로 직접 렌더하는 게 유연하다. `model` 도 캐릭터 데이터가 아니다(관리자 소유, env `LLM_MODEL`).
- **프리셋 개념은 없다** (`characters.ts`·`presetId` 제거됨). 사용자가 처음부터 필드를 직접 채워 자기 캐릭터를 만든다 — "둘 중 하나 고르기"는 옛 모델이다. 나중에 "빠른 시작"이 필요하면 native 폼의 기본값으로 넣으면 되고, 백엔드 개념은 필요 없다.
- API는 `src/character/` (`CharacterModule`): `GET options`(선택지 vocab), `GET me`, `POST`(필드 세트+관심사로 생성), `PATCH me`(부분수정), `DELETE me`. 표시용 필드만 내려주고 `instruction`/`model` 은 노출하지 않는다.

## 대화 저장 (Conversation)

- 채팅은 **DB에 저장되는 대화**다. `src/conversation/` (`ConversationModule`)가 담당하며, MVP1 채팅의 정식 경로다. (구 stateless `src/chat/` 모듈은 제거됨 — conversation이 유일한 채팅 경로다.)
- 데이터: `Conversation`(유저당 N개) ↔ `Message`(role `user|assistant`). 대화 목록은 `updatedAt desc` 정렬 + 마지막 메시지 preview.
- API는 전부 **현재 유저 기준**이고 소유권 격리가 핵심 — 조회/수정/삭제는 항상 `where: { ..., userId }` 로 본인 것만 만진다 (남의 대화 접근 시 `NotFoundException`, 삭제는 `deleteMany`로 멱등).
  - `GET /conversations`(목록), `GET /conversations/:id`(상세+메시지), `POST /conversations`(첫 메시지로 **지연 생성**), `POST /conversations/:id/messages`(이어가기), `DELETE /conversations/:id`, `DELETE /conversations/:id/messages/:messageId`.
- **지연 생성(lazy)**: "새 채팅" 버튼은 빈 화면만 열고, 첫 메시지를 보낼 때 비로소 `Conversation` 을 만든다 (빈 대화가 DB에 안 쌓이게).
- 매 교환마다 서버가 DB에서 **해당 대화의 전체 히스토리를 읽어** LLM에 넘긴다. 히스토리·instruction을 클라이언트가 보내지 않는다(신뢰 경계).
- 최종 instruction 은 `buildInstruction` 이 조립한다: 캐릭터 이름 + **유저 이름** + **장기 메모리(`MemoryService.recall`)** + **캐릭터 페르소나**(`getPromptContext` 가 구조화 필드로 `buildPersonaInstruction` 조립 — 저장된 instruction 컬럼은 없다). 메모리 선택은 반드시 `recall()` 만 거친다(아래 "장기 메모리" 참고). model은 env에서 해석.
- 매 교환 후 **N메시지마다 백그라운드로 메모리를 추출**한다(`MEMORY_EXTRACT_EVERY_N`). 판단은 `exchange` 가 반환하는 `messageCount`(= 이미 읽은 히스토리 길이 + 1)로 하며 **별도 count 쿼리를 하지 않는다**.
- nested write 만 하면 `@updatedAt` 이 안 올라가므로 답변 저장 시 `updatedAt: new Date()` 를 명시 갱신한다(목록 최근순 정렬용).
- **상품추천(대화 중)**: `exchangeWithTools` 가 `search_products` 툴을 붙여(`chatWithTools`) 대화한다. 모델이 쇼핑 의도로 판단하면 툴을 부르고(인자=검색조건), 실행기가 `CommerceService.search` 로 후보를 가져와 재주입 → **같은 채팅 LLM이 이유 있는 답**을 쓴다 (별도 추천 서비스·구조화 없음 — 검색조건 도출·이유 생성 모두 채팅 LLM이 함). 툴 없는 순수 대화용 기본 `exchange` 는 재사용 위해 보존. 검색된 상품은 실행기 클로저로 붙잡아 `Message.products`(`Json?`)에 **`ProductType[]` 스냅샷**으로 저장한다 — 그 시점 가격·정보를 박제해 새로고침에도 카드가 유지되고 대화와 일관(참조·재조회 아님). 클라는 이 스냅샷을 버블 아래 카드로 렌더. **"다음/다른 상품"** 은 `search_products(more:true)` + `Conversation.lastSearch`(페이징 커서)로 이어 검색한다 — tool 결과는 턴 사이 DB 히스토리에 안 남아 모델이 `nextStart` 를 기억 못 하므로, 서버가 대화 단위로 커서를 저장·재사용한다(소진 시 `exhausted` 반환).

## 장기 메모리 (Memory)

- MVP1 간판 기능 — "나를 기억하는 AI". `src/memory/`(`MemoryModule`). 대화에서 지속적 사실을 뽑아 저장하고 다음 대화 프롬프트에 주입한다.
- **주입(recall)과 표시(list)를 분리한다**:
  - `recall(userId)` = "프롬프트에 넣을 메모리 선택" — **벡터 교체 seam**이다. 지금은 importance 순 전부. 수가 많아지면 이 메서드 **내부만** top-N(importance) → 유사도 top-k(pgvector `vector` 컬럼 추가)로 바꾼다. 호출자(Conversation)는 안 바뀐다.
  - `list(userId)` = "AI가 기억하는 나" 화면용 — 항상 전부(+`id` 포함, 삭제용).
- **추출(extractMemory)**: `ConversationService` 가 N메시지마다 **fire-and-forget** 호출(응답 지연 0). 최근 window개 메시지 → 기존 메모리와 함께 LLM 구조화 추출(`structured`) → 새 사실만 저장.
  - 방침: **지속적 사실만**(일회성 이벤트/약속 제외), **추가만**(갱신·모순 해결 안 함 — 사용자가 삭제로 교정), 중복은 **LLM(의미) + 코드(정확일치) 2중** 제거.
  - 프롬프트·zod 스키마는 `memory.prompt.ts`(순수). category는 enum 강제, importance는 1~3 코드 클램프.
  - 백그라운드라 `extractMemory` 안에서 try/catch 로 에러를 삼키고 로깅만 한다 (위 "에러 처리" 원칙의 **의도적 예외** — 채팅 응답에 영향 0).
- 데이터: `Memory`(userId, `category`=`MemoryCategory` enum 7개, content, importance). content는 짧은 사실 1개 = row 1개, 주입·표시 겸용.
- **벡터는 지금 안 넣는다**: 메모리 소수라 전부 주입이 더 싸고 정확. recall seam + 루트 AGENTS.md 방침 덕에 나중에 컬럼 추가 + recall 내부 교체로 붙는다.
- 튜닝 env(나중에 Settings 테이블로 이전): `MEMORY_EXTRACT_WINDOW`, `MEMORY_EXTRACT_EVERY_N`, `MEMORY_EXTRACT_MODEL`(비우면 `LLM_MODEL`). 읽는 곳은 서비스 생성자 **1곳**(env→DB 전환 seam).
- API(`MemoryModule`): `GET /memories`(내 전체), `DELETE /memories/:id`(교정용, 본인 것만 멱등). 전부 현재 유저 기준.

## 커머스 — 상품 검색 (Commerce)

- MVP2 상품추천의 **검색 계층**. `src/commerce/`(`CommerceModule`). `CommerceService.search(criteria)` 가 **네이버 쇼핑검색 API**를 호출해 **정규화된 `ProductType[]`**(packages/types) 로 반환한다.
- **벤더(네이버) 격리**: 네이버 원본(HTML `<b>` title, 문자열 `lprice`, `category1~4`)과 호출 에러는 이 서비스 안에서 흡수해 `ProductType` 으로 변환한다 — `openai` 가 `llm/`에 갇히듯 **naver는 `commerce/`에만** 안다. 소비처(Conversation)는 `ProductType` 만 본다.
- **catalog 아니라 search seam**: 실제 커머스 API는 "우리 소유 카탈로그"가 아니라 검색 엔드포인트다. 그래서 `search(criteria)` 형태로 모델링. 프로바이더가 **2개 이상(쿠팡/아마존)** 되면 그때 인터페이스+DI토큰으로 분리한다 — 지금은 단일이라 안 만든다(과한 추상화 지양).
- **정규화 타입은 공통분모 + 옵셔널 신호**: `ProductType` 은 세 API 공통분모(id·title·price·currency·imageUrl·productUrl·mall·brand·category). `rating?`/`reviewCount?`/`isRocket?` 는 옵셔널 — 프로바이더별로 있는 것만 채우고 소비처는 present 필드만 쓴다.
- **필터·페이징**: 네이버는 `sort`(정확도/가격/날짜)만 있고 가격·카테고리 필터 파라미터가 없어 **후처리**한다. `start`(1~1000)·`display`(≤100)는 **독립 제약**(합계 제한 없음). `search` 는 raw 를 스캔하며 필터 통과분을 `limit` 까지 모으고 **커서(`nextStart`)를 실제 스캔한 raw 개수만큼만 전진**(slice 유실·중복 방지). `ProductSearchResultType`(products·nextStart·hasMore) 반환, 클라는 `nextStart` 를 opaque 커서로 에코백(무상태).
- **호출량**: 네이버 쿼터는 호출 1회 = 1카운트(개수 무관). 페이징 절약이 필요하면 나중에 **배치 캐싱**(한 번에 받아 캐시에서 페이지 서빙) — 지금은 무상태라 잉여분 재사용 안 됨.
- `GET /products` 는 **임시 테스트용**(LLM 없음). 정식 소비 경로는 채팅 tool-use(위 Conversation "상품추천").

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
