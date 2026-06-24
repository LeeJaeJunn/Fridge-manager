# nest-companion (백엔드) 전용 지침

이 문서는 **NestJS 백엔드 전용** 규칙이다. 레포 전체 규칙은 루트 `AGENTS.md` 를 참고.

## LLM / 벤더 추상화

- 모든 LLM 호출은 `LlmService` 를 통한다. 다른 모듈(Chat/Memory 등)은 `LlmService` 의 메서드만 쓰고 벤더(OpenAI)를 직접 알지 못한다.
- `openai` 패키지 import 는 `src/llm/` 폴더 안에서만 한다. 벤더 응답(`res`)은 `llm/` 안에서 벤더 중립 타입(`ChatResType` 등)으로 변환해 반환한다.
- 모델명은 호출하는 쪽에서 파라미터로 넘긴다 (호출별로 다른 모델 사용 가능).
- 단, 채팅에 쓰는 모델은 **사용자/캐릭터가 정하지 않고 관리자 소유**다. `ChatService` 가 `LLM_MODEL`(env)을 읽어 넘긴다. (나중에 Settings 테이블 + 관리자 페이지로 이전 예정)

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
- 캐릭터의 `name` / `instruction` 은 **사용자가 설정·수정** 한다. 최초 생성 시 프리셋의 값을 복사해 시작한다.
- `src/chat/characters.ts` 는 "선택 가능한 캐릭터 목록"이 아니라 **페르소나 프리셋(시드 템플릿)** 이다. 소수·정적이라 코드에 둔다 (새 캐릭터 생성 시 instruction/기본 이름의 출처).
- `model` 은 캐릭터 데이터가 아니다 — 관리자 소유로 env(`LLM_MODEL`)에서 온다 (위 "신뢰 경계" 참고).

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
