# nest-companion (백엔드) 전용 지침

이 문서는 **NestJS 백엔드 전용** 규칙이다. 레포 전체 규칙은 루트 `AGENTS.md` 를 참고.

## LLM / 벤더 추상화

- 모든 LLM 호출은 `LlmService` 를 통한다. 다른 모듈(Conversation/Memory 등)은 `LlmService` 의 메서드만 쓰고 벤더(OpenAI)를 직접 알지 못한다.
- `openai` import(및 `openai/helpers/zod`)는 `src/llm/` 폴더 안에서만 한다. 벤더 응답(`res`)은 `llm/` 안에서 벤더 중립 타입(`ChatResType`/`StructuredResType<T>`)으로 변환해 반환한다.
- 두 메서드: `chat()` = 자유 텍스트, `structured<T>()` = 스키마 강제(JSON). 구조화는 **zod 스키마**를 받아 `responses.parse` + `zodTextFormat` 로 **검증된** 객체를 돌려준다(`JSON.parse`/`as T` 캐스팅 없음). zod 스키마 자체는 openai 무관이라 도메인 모듈(예: `memory.prompt.ts`)에 둔다.
- 두 메서드 모두 반환에 **`usage`(토큰)** 를 담는다 — 지금은 소비처 없지만 나중에 어드민 사용량 표시/구독 쿼터용으로 수집.
- 모델명은 호출하는 쪽에서 파라미터로 넘긴다 (호출별로 다른 모델 사용 가능).
- 단, 채팅에 쓰는 모델은 **사용자/캐릭터가 정하지 않고 관리자 소유**다. `ConversationService` 가 `LLM_MODEL`(env)을 읽어 넘긴다. (나중에 Settings 테이블 + 관리자 페이지로 이전 예정)

## 에러 처리

- 컨트롤러/서비스를 try-catch 로 감싸지 않는다. 적절한 예외를 throw 하면 Nest 전역 예외 계층이 HTTP 응답으로 변환한다.
- 입력 검증 실패 등 알려진 조건 → `BadRequestException` / `NotFoundException` 등을 throw.
- 벤더(OpenAI) 호출 에러는 `LlmService` 안에서 try-catch 로 잡아 **로깅 + 의미있는 예외**(예: `ServiceUnavailableException`)로 변환한다. 벤더 에러(`APIError`)가 바깥 모듈로 새지 않게 한다.

## 보안 — 신뢰 경계 (trust boundary)

- **서버 동작을 결정하는 값(시스템 프롬프트/`instruction`, 사용할 `model`)은 서버 소유다. 클라이언트가 보내게 하지 않는다.**
- `instruction` 은 서버가 DB(유저의 Character)에서, `model` 은 env(`LLM_MODEL`)에서 해석한다. 클라이언트가 이 값들을 보내거나 고르게 하지 않는다. (프롬프트 조작·탈옥·모델 비용 악용 방지)
- 클라이언트에 내려주는 캐릭터 정보는 **표시용**(name 등)에 한정하고 `instruction`/`model` 은 노출하지 않는다.

## 캐릭터 데이터

- **유저당 캐릭터는 하나다** (여러 개 중 선택이 아님). DB에서 `User` ↔ `Character` 1:1 (`Character.userId @unique`).
- 캐릭터의 `name` 은 **사용자가 설정·수정** 한다. `instruction`/`description` 은 최초 생성 시 프리셋의 값을 복사해 시작한다(현재 UI에선 instruction 직접 수정은 미노출).
- `description` 은 캐릭터 카드용 한 줄 소개(표시용). `instruction`(시스템 프롬프트)과 별개다.
- `src/character/characters.ts` 는 "선택 가능한 캐릭터 목록"이 아니라 **페르소나 프리셋(시드 템플릿)** 이다. 소수·정적이라 코드에 둔다 (새 캐릭터 생성 시 instruction/description/기본 이름의 출처).
- `model` 은 캐릭터 데이터가 아니다 — 관리자 소유로 env(`LLM_MODEL`)에서 온다 (위 "신뢰 경계" 참고).
- API는 `src/character/` (`CharacterModule`): `GET presets`(프리셋 목록), `GET me`, `POST`(presetId로 생성), `PATCH me`(name 수정), `DELETE me`. 표시용 필드만 내려주고 `instruction`/`model` 은 노출하지 않는다.

## 대화 저장 (Conversation)

- 채팅은 **DB에 저장되는 대화**다. `src/conversation/` (`ConversationModule`)가 담당하며, MVP1 채팅의 정식 경로다. (구 stateless `src/chat/` 모듈은 제거됨 — conversation이 유일한 채팅 경로다.)
- 데이터: `Conversation`(유저당 N개) ↔ `Message`(role `user|assistant`). 대화 목록은 `updatedAt desc` 정렬 + 마지막 메시지 preview.
- API는 전부 **현재 유저 기준**이고 소유권 격리가 핵심 — 조회/수정/삭제는 항상 `where: { ..., userId }` 로 본인 것만 만진다 (남의 대화 접근 시 `NotFoundException`, 삭제는 `deleteMany`로 멱등).
  - `GET /conversations`(목록), `GET /conversations/:id`(상세+메시지), `POST /conversations`(첫 메시지로 **지연 생성**), `POST /conversations/:id/messages`(이어가기), `DELETE /conversations/:id`, `DELETE /conversations/:id/messages/:messageId`.
- **지연 생성(lazy)**: "새 채팅" 버튼은 빈 화면만 열고, 첫 메시지를 보낼 때 비로소 `Conversation` 을 만든다 (빈 대화가 DB에 안 쌓이게).
- 매 교환마다 서버가 DB에서 **해당 대화의 전체 히스토리를 읽어** LLM에 넘긴다. 히스토리·instruction을 클라이언트가 보내지 않는다(신뢰 경계).
- 최종 instruction 은 `buildInstruction` 이 조립한다: 캐릭터 이름 + **유저 이름** + **장기 메모리(`MemoryService.recall`)** + 캐릭터 `instruction`. 메모리 선택은 반드시 `recall()` 만 거친다(아래 "장기 메모리" 참고). model은 env에서 해석.
- 매 교환 후 **N메시지마다 백그라운드로 메모리를 추출**한다(`MEMORY_EXTRACT_EVERY_N`). 판단은 `exchange` 가 반환하는 `messageCount`(= 이미 읽은 히스토리 길이 + 1)로 하며 **별도 count 쿼리를 하지 않는다**.
- nested write 만 하면 `@updatedAt` 이 안 올라가므로 답변 저장 시 `updatedAt: new Date()` 를 명시 갱신한다(목록 최근순 정렬용).

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

## 인증 — dev-auth 시드 (로그인은 나중)

- 실제 로그인(Passport/JWT)은 뒤로 미루고, 테스트 시 매번 로그인하지 않도록 **개발용 인증 시드**를 둔다. `src/auth/`.
- `DevAuthGuard`: `DEV_AUTH !== 'true'` 면 401. 그 외에는 `x-user-id` 헤더(없으면 `DEV_USER_ID`)를 `req.userId` 로 세팅.
- `@CurrentUser()` 데코레이터로 컨트롤러에서 `req.userId` 를 꺼낸다. 모든 유저 스코프 라우트는 이 값 기준.
- 부팅 시 `DEV_AUTH` 면 `DEV_USER_ID` 유저를 upsert 시드(`dev-user.seed.ts`).
- env: `DEV_AUTH=true`, `DEV_USER_ID=dev-user`. **프로덕션에선 `DEV_AUTH` 를 끄고 실제 인증으로 교체** — 이 가드/시드가 트러스트 경계 우회로가 되지 않게.
- 로그인 붙일 때 바꾸는 건 가드 한 곳 + `@CurrentUser()` 해석부뿐이고, 컨트롤러/서비스는 그대로다(같은 `userId` 계약).

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

## 개발 워크플로우 주의

- 개발 서버는 `pnpm start:dev`(`nest start --watch`). 끄면 4000 포트가 닫혀 native가 `ERR_CONNECTION_REFUSED` 를 받는다 — 권한 문제가 아니라 백엔드가 안 떠 있는 것.
- 가끔 `Cannot find module './app.module'` 로 죽었다 살아나는 건 **watch 재빌드 도중의 빈 창** 때문이다: `deleteOutDir`(nest-cli) 가 dist를 통째로 비우고 다시 컴파일하는 사이 `main.js` 는 있는데 `app.module.js` 가 아직 없는 타이밍에 재시작되면 크래시 → 빌드 끝나면 복구. **배포(한 번 build → `node dist/main`)에는 없는 문제**다.
  - 특히 watch가 도는 중 `prisma generate`/`pnpm db:migrate` 를 돌리면 `src/generated/prisma` 무더기 변경으로 재빌드 폭풍이 나서 잘 터진다 → **watch를 끈 상태에서** generate/migrate 하는 걸 권장.
  - 정 거슬리면 `nest-cli.json` 의 `deleteOutDir: false`(제자리 덮어쓰기로 빈 창 제거) 옵션도 가능. 필수는 아님.
