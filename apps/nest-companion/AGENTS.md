# nest-companion (백엔드) 전용 지침

이 문서는 **NestJS 백엔드 전용** 규칙이다. 레포 전체 규칙은 루트 `AGENTS.md` 를 참고.

## LLM / 벤더 추상화

- 모든 LLM 호출은 `LlmService` 를 통한다. 다른 모듈(Conversation/Memory 등)은 `LlmService` 의 메서드만 쓰고 벤더(OpenAI)를 직접 알지 못한다.
- `openai` import(및 `openai/helpers/zod`)는 `src/llm/` 폴더 안에서만 한다. 벤더 응답(`res`)은 `llm/` 안에서 벤더 중립 타입(`ChatResType`/`StructuredResType<T>`)으로 변환해 반환한다.
- 세 메서드: `chat()` = 자유 텍스트, `structured<T>()` = 스키마 강제(JSON), `chatWithTools()` = 함수 호출(tool use). 구조화는 **zod 스키마**를 받아 `responses.parse` + `zodTextFormat` 로 **검증된** 객체를 돌려준다(`JSON.parse`/`as T` 캐스팅 없음). zod 스키마 자체는 openai 무관이라 도메인 모듈(예: `memory.prompt.ts`)에 둔다.
- `chatWithTools()`: 툴 정의(`LlmTool`, `parameters`는 JSON Schema)와 실행기(`LlmToolExecutor`)를 **호출자가 만들어 넘기면**, tool-call 루프(모델이 `function_call` → 실행기 실행 → 결과 `function_call_output` 재주입 → 재호출)를 **`llm/` 안에서** 돈다. 툴 정의·실행기는 벤더 중립 타입이라 도메인(Conversation 등)이 소유하고 openai를 모른다. usage는 **모든 왕복 누적**, `maxRounds` 마지막 라운드는 `tool_choice:'none'`으로 텍스트 답을 강제(툴만 내다 빈 답 나가는 것 방지).
- **입력은 `LlmInputItemType[]`(판별 유니온)** 이다 — `text`(role+content) / `function_call`(callId·name·arguments) / `function_call_output`(callId·name·output). 말풍선만이 아니라 **지난 턴의 툴 호출·결과까지 그대로 재생**해서 보낸다. 저장 포맷은 **벤더 중립**이고 각 provider 가 자기 모양으로 조립한다(OpenAI `function_call_output` ↔ Gemini `function_result`, arguments 문자열화 여부 등) — 그래야 `LLM_MODEL` 을 바꿔도 과거 대화가 재생된다. 이 타입은 클라가 볼 일이 없어 `@companion/types` 가 아니라 `llm/llm-provider.interface.ts` 에 둔다.
- **종결 툴(`LlmTool.terminal`)**: 모델이 이 툴을 부르면 **실행하지 않고** 그 호출을 `terminalCalls` 로 올리고 루프를 끊는다. 말하자면 **실행기가 사람인 툴**이다 — 결과(`function_call_output`)를 서버가 아니라 사용자의 확인 행동이 만든다(아래 Conversation 참고). `TerminalToolCall` 은 `callId` 를 반드시 싣는다(결과와 짝을 맞추는 유일한 키라 여기서 잃으면 대화를 되살릴 수 없다).
- 모델은 **텍스트와 툴 호출을 같이 낼 수 있다.** 종결 툴이 불려도 `res.text` 를 버리지 않는다("맛있었겠다!" + `update_inventory`).
- ⚠️ **OpenAI `instructions` 파라미터는 프롬프트 캐시 프리픽스에 안 들어가는 것으로 보인다** — 문서가 캐시 대상으로 `messages` 배열과 `tools` 만 명시하고 `instructions` 는 언급하지 않으며, 12만 토큰을 `instructions` 로 넣고 `cached_tokens: 0` 이 나온 사례가 있다. 캐싱을 켜려면 정적 프롬프트를 **`input` 첫 `developer` 메시지**로 옮겨야 한다(아직 안 함 — `buildPrompt` 가 이미 쪼개놔서 배선만 바꾸면 된다).
- `structured()` 는 인자가 6개라 **위치가 아니라 이름**(`StructuredReqType`)으로 받는다 — `instructions`/`input`/`schemaName` 이 전부 string 이라 위치 인자면 뒤바뀌어도 컴파일러가 못 잡는다.
- **이미지 입력(`images: LlmImageType[]`)** 은 `structured()` 에만 있다(영수증·사진 스캔용). `detail` 이 정확도와 비용을 동시에 좌우한다 — 영수증처럼 **작은 글자를 읽어야 하면 `'high'`**, 냉장고 사진처럼 사물만 알아보면 되면 `'auto'`/`'low'`. ⚠️ **OpenAI 만 지원**한다(Gemini 는 `structured()` 자체를 아직 거부). 이미지가 없으면 `input` 을 문자열 그대로 넘겨 기존 동작이 유지된다.
- 세 메서드 모두 반환에 **`usage`(토큰)** 를 담고, `LlmService` 가 그걸 **원장(`LlmUsage`)에 기록**한다 — 아래 "사용량 계측" 참고. 그래서 세 메서드는 `UsageContextType` 을 **필수 인자**로 받는다.
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
- **`instruction`(시스템 프롬프트)은 저장하지 않는다** — 구조화 필드에서 **프롬프트 시점에 매번 조립**한다. 조립은 `conversation/conversation.prompt.ts` 의 `buildPrompt` 가 하고, `persona.ts` 는 **프롬프트 문구를 갖지 않는다**(아래 "프롬프트 조립" 참고). 템플릿을 고치면 기존 캐릭터도 자동 반영. (신뢰 경계: 클라는 설정값을 보내지만 조립된 instruction/model 은 서버 소유·비노출.)
- `persona.ts` 는 이제 **캐릭터 API 의 데이터만** 담당한다 — 선택지 vocab·`LIMITS`·`TAG_GROUPS`/`tagToMemory`. 프롬프트 문구는 전부 `conversation.prompt.ts` 로 옮겼다(예전엔 양쪽에 흩어져 있어서 한 줄 고치려면 두 파일을 오갔고, 최종 프롬프트에서 무엇이 몇 번째로 들어가는지 읽어낼 수 없었다).
- `speechStyle` 은 안정적 키를 **String 컬럼**에 저장한다(DB enum 회피). 값→한국어 라벨, 선택지 vocab(말투/온보딩 태그), **입력 제한값(`LIMITS`)** 은 전부 **`persona.ts` 가 소유**하고 `GET options` 로 native 에 내려준다. DTO 검증(@IsIn/@MaxLength)도 같은 상수를 쓴다 — **DTO 에 숫자를 직접 쓰지 말 것**(숫자가 두 곳에 박히면 한쪽만 고쳐 어긋난다).
- **클라 검증은 UX, 서버 검증이 방어다.** 앱은 신뢰 경계 밖이라 curl 로 바로 API 를 때릴 수 있고, 온보딩 태그는 메모리로 시드돼 프롬프트에 들어간다 → `@IsIn(TAG_VALUES)` 를 빼면 임의 문자열이 프롬프트에 섞인다. 클라 제한은 "미리 알려주기"일 뿐 자물쇠가 아니다.
- ⚠️ **vocab·제한값을 `@companion/types` 에 상수로 옮기지 말 것.** 그 패키지는 타입 전용(런타임 엔트리 없음)이라 값을 import 하면 **tsc·CI 는 통과하는데 서버 부팅이 죽는다**(`ERR_PACKAGE_PATH_NOT_EXPORTED`). 실제로 확인함. 값은 API 로 내려주는 게 정답이고, 덤으로 앱 배포 없이 vocab·제한을 바꿀 수 있다. ⚠️ vocab 은 문자열-리터럴 유니온으로 좁히지 말 것(`as const` 금지) — `===`/`!==` 비교 시 `no-unsafe-enum-comparison` 규칙이 크래시한다. 같은 이유로 이 레포는 `x !== undefined` 대신 `typeof x !== 'undefined'` 를 쓴다.
- **온보딩 태그는 캐릭터가 아니라 유저 정보**다 → 생성 시 **Memory row 로 시드**한다(캐릭터·태그 생성을 한 `$transaction`). 태그는 **세 그룹**이고 그룹마다 카테고리가 다르다 — 식성→`PREFERENCE`, **알레르기→`ALLERGY`(안전)**, 조리도구→`OWNERSHIP`. **content 는 선택값을 그대로** 저장한다 — 문장으로 감싸지 않는다("오이", "에어프라이어"). 프롬프트가 카테고리별 섹션(`# 요리 장비` / `# ⚠️ 알레르기…`)으로 나뉘어 **헤더가 이미 의미를 말해주기** 때문이고, 알레르기는 재고 이름과 그대로 대조해야 해서 이름이어야 한다. (조리도구만 `${v} 있음` 으로 감쌌다가 섹션을 나누면서 "요리 장비: 에어프라이어 **있음**" 이 돼 걷어냈다. 그때 기존 행도 함께 정리했다.) ⚠️ **섹션 헤더와 content 는 짝이다** — 헤더를 없애거나 다시 한 목록으로 합치면 "에어프라이어"만 남아 뜻을 잃는다. 매핑은 `persona.ts` 의 `TAG_GROUPS`/`tagToMemory` 가 소유하고, 요청 내 중복은 서비스에서 제거한다. recall 주입/표시 파이프라인을 그대로 타서 첫 대화부터 작동하고, 관리(삭제)는 메모리 API 로 한다. 캐릭터엔 태그 컬럼이 없다.
- **파생 데이터는 저장하지 않는다.** `model` 도 캐릭터 데이터가 아니다(관리자 소유, env `LLM_MODEL`).
- API는 `src/character/` (`CharacterModule`): `GET options`(선택지 vocab + 태그 그룹), `GET me`, `POST`(name·speechStyle·userNickname·tags 로 생성), `PATCH me`(부분수정), `DELETE me`. 표시용 필드만 내려주고 `instruction`/`model` 은 노출하지 않는다.

## 대화 저장 (Conversation)

- 채팅은 **DB에 저장되는 대화**다. `src/conversation/` (`ConversationModule`)가 담당하며, 채팅의 정식 경로다. (구 stateless `src/chat/` 모듈은 제거됨 — conversation이 유일한 채팅 경로다.)
- **데이터 모양이 핵심이다**: `Message` 는 말풍선만이 아니라 **툴 호출·결과까지 한 줄기 시간순 아이템**으로 담는다.
  - `type`(`MessageItemType`) = `TEXT` | `FUNCTION_CALL` | `FUNCTION_CALL_OUTPUT`, `role`·`content` 는 **TEXT 일 때만**, 나머지는 `payload`(Json).
  - `FUNCTION_CALL` payload = `{ callId, name, arguments, resolved? }` — `arguments` 는 모델이 한 말, `resolved` 는 서버가 화면용으로 가공한 값(원본 인자엔 `ingredientId` 가 없어 카드가 apply 를 못 하므로 필요).
  - `FUNCTION_CALL_OUTPUT` payload = `{ callId, name, output }`.
  - **툴 전용 컬럼을 두지 않는 게 요점**이다. 예전엔 `products`/`hasMoreProducts`/`pendingChange` 처럼 툴이 늘 때마다 컬럼이 늘고 마이그레이션이 따라왔다. 이제 툴이 추가돼도 스키마는 그대로고, **앱이 모르는 툴은 조용히 건너뛰면** 구버전 클라도 안 깨진다.
  - `@companion/types` 의 `MessageType` 은 `type` 기준 **판별 유니온**이라, 좁히지 않으면 `content`/`payload` 에 접근할 수 없다(새 타입 처리를 빠뜨리면 컴파일러가 잡는다).
- 대화 목록은 `updatedAt desc` 정렬 + preview. **preview 는 마지막 `TEXT` 만** 본다(마지막 아이템이 툴 호출이면 보여줄 텍스트가 없다).
- API는 전부 **현재 유저 기준**이고 소유권 격리가 핵심 — 조회/수정/삭제는 항상 `where: { ..., userId }` 로 본인 것만 만진다 (남의 대화 접근 시 `NotFoundException`, 삭제는 `deleteMany`로 멱등).
  - `GET /conversations`(목록), `GET /conversations/:id`(상세+메시지), `POST /conversations`(첫 메시지로 **지연 생성**), `POST /conversations/:id/messages`(이어가기), `DELETE /conversations/:id`, `DELETE /conversations/:id/messages/:messageId`.
- **지연 생성(lazy)**: "새 채팅" 버튼은 빈 화면만 열고, 첫 메시지를 보낼 때 비로소 `Conversation` 을 만든다 (빈 대화가 DB에 안 쌓이게).
- 매 교환마다 서버가 DB에서 **해당 대화의 전체 아이템을 읽어** 재생한다(`toLlmItems`). 히스토리·instruction을 클라이언트가 보내지 않는다(신뢰 경계).
  - ⚠️ **미확인 호출에는 자리표시 결과를 붙인다.** OpenAI 는 짝 없는 `function_call` 이 입력에 있으면 400(`No tool output found for function call ...`)으로 거절한다. 사용자가 확인 카드를 무시한 채 다음 메시지를 보내면 정확히 그 상태가 되므로, **재생 시점에만** `{ pending: true }` 결과를 만들어 짝을 채운다(DB엔 안 쓴다). 덤으로 모델이 "저 제안은 아직 대기 중"임을 알아 같은 제안을 반복할 이유가 준다.

### 프롬프트 조립 (`conversation.prompt.ts`)

**문구와 순서를 이 파일 하나가 소유한다.** Nest·DB·LLM 을 모르는 순수 모듈이라 `conversation.prompt.spec.ts` 로 전부 고정된다.

- 나누는 축은 **"턴마다 바뀌느냐"** 이고, 그게 그대로 프롬프트 캐싱의 절단선이다. 새 블록을 넣을 때 "이건 턴마다 바뀌나?"만 답하면 자리가 정해진다.
  - `system` — 정체성(이름·역할·유저 이름·말투·호칭) → 대화 규칙 → 레시피 지침 → 가드레일. **대화 내내 그대로.**
  - `context` — 요리 장비 → 사용자 특성 → 냉장고 재고 → **알레르기(맨 끝)**. **매 턴 달라진다.**
    - **기억을 카테고리별 섹션으로 가른다**(`splitMemories`). 예전엔 전부 "기억하는 것" 한 목록이라 조리도구("에어프라이어")와 식성("매운 음식 좋아함")이 뒤섞였는데, 모델 입장에서 **"뭘 가지고 있는지"(조리 가능 여부)와 "어떤 사람인지"(요리 선택)는 쓰임이 다르다.** `OWNERSHIP`→요리 장비 / `PREFERENCE`·`PROFILE`·`ETC`→사용자 특성 / `ALLERGY`→맨 끝 전용 블록.
    - 짧은 이름만 오는 섹션(장비·알레르기)은 **콤마로 한 줄**, 추출 LLM 이 문장을 만드는 사용자 특성은 **줄바꿈 목록**이다. 문장을 콤마로 이으면 어디서 한 항목이 끝나는지 흐려진다.
- **`context` 는 DB 에 저장하지 않고 보낼 때만 마지막 사용자 메시지에 얹는다**(`attachContext`). 지난 user 메시지는 절대 건드리지 않는다 — 옛 재고가 히스토리에 남으면 모델이 지금 상태와 헷갈리고, 턴마다 앞부분이 달라져 프리픽스 캐시도 죽는다. 출처를 밝히는 라벨(`[현재 상태 — 시스템이 붙인 정보이며 사용자가 입력한 것이 아니다]` / `[사용자 메시지]`)을 함께 붙여 모델이 "사용자가 재고를 타이핑했다"고 읽지 않게 한다.
- **재고 주입**: 재료마다 **남은 일수를 서버가 계산해** 넣는다(`- 대파 · 내일까지`). 모델은 오늘 날짜를 모르거나 틀리게 알아서 날짜만 주면 "곧 상해요" 판단을 못 한다. 추정치는 `(추정)` 으로 밝힌다. 비면 "재료 없음"을 명시해 모델이 지어내지 않게 한다. **재고 블록엔 재고 정보만** 넣는다.
- **알레르기·먹으면 안 되는 재료**: `splitMemories` 가 **카테고리(`ALLERGY`)로만** 판정하고, 전용 블록이 **맨 끝**에 온다. 중간에 두면 "임박한 재료 먼저" 지침에 밀려 실제로 알레르기 재료를 1순위 추천하는 걸 확인했다.
  - **방침은 "추천을 막되 선택은 막지 않는다"** — 우리가 먼저 권하지는 않지만, 사용자가 직접 그 요리를 만들겠다고 하면 **짧게 한 번만** 주의를 주고 도와준다. 블록 안에서도 **금지를 먼저, 예외를 나중에** 둔다(예외가 앞에 오면 금지 자체를 약하게 읽는다).
  - ⚠️ **같은 정책이 system 의 `# 요리 추천` 에도 있다. 한쪽만 고치면 두 지시가 모순되고**, 맨 끝에 오는 이 블록이 이길 가능성이 높아 의도한 변경이 반영되지 않는다. 반드시 함께 고칠 것.
  - ⚠️ 제목을 "알레르기"로만 줄이지 말 것 — 이 카테고리는 종교·비건처럼 알레르기가 아닌 "못 먹는 재료"도 담고, system 의 규칙 문장과 낱말이 같아야 모델이 규칙과 목록을 이어 읽는다.
  - 예전엔 재고 줄에 인라인 ⚠️ 도 붙였는데 지웠다. 이름 부분일치라 "김"이 "김치를 못 먹음"에 걸리는 오탐이 있었고, 반대로 "갑각류"는 "새우"를 못 잡았다. 지금은 `context` 안에서 재고 바로 다음 줄이라 거리가 거의 없다. **인라인을 되살리고 싶어지면 그 전에 "알레르기 재료가 가장 임박한 상태에서 뭐 해먹지?" 를 먼저 재현해볼 것.**
- 매 교환 후 **N말풍선마다 백그라운드로 메모리를 추출**한다(`MEMORY_EXTRACT_EVERY_N`). 판단은 `exchangeWithTools` 가 돌려주는 `messageCount` 로 하며 **별도 count 쿼리를 하지 않는다**.
  - ⚠️ 세는 건 **`TEXT` 행뿐**이다(`countText`). 아이템 구조로 바뀌면서 한 턴이 1행이 아니라 2~3행(`TEXT`+`FUNCTION_CALL`+`FUNCTION_CALL_OUTPUT`)이 될 수 있어, 전부 세면 같은 대화량에서 추출이 2~3배 자주 돌았다("억지 추출"의 원인 중 하나). 툴을 추가할 때 이 규칙을 깨지 말 것 — `extractEveryN` 이 "몇 마디마다"라는 의미를 유지해야 한다.
- nested write 만 하면 `@updatedAt` 이 안 올라가므로 답변 저장 시 `updatedAt: new Date()` 를 명시 갱신한다(목록 최근순 정렬용).

### 툴은 둘 다 종결 툴이고, 실행 주체만 다르다

`exchangeWithTools` 가 툴 **둘**(`update_inventory`, `search_recipes`)을 붙여 대화한다. **둘 다 `terminal: true`** 라 provider 는 실행하지 않고 호출만 올려주고, 실행 주체는 `ConversationService` 에서 갈린다:

| 툴                 | 실행 주체                          | 저장                                                             |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| `update_inventory` | **사람** — 확인 카드를 눌러야 반영 | `FUNCTION_CALL` 만. 결과는 apply/dismiss 때 별도 행              |
| `search_recipes`   | **서버** — 즉시 검색               | `FUNCTION_CALL` + `FUNCTION_CALL_OUTPUT` 을 **같은 배치에 함께** |

- **모든 툴이 종결이라 `executors` 는 빈 객체**다. provider 안의 툴 루프(재주입 → 재호출)는 실행되는 경로가 없다 — 걷어낼 예정이고, 그때 `terminal` 플래그·`executors`·`maxRounds` 가 함께 사라진다. 나중에 루프가 필요해지면 **provider 가 아니라 `ConversationService` 에서** 감싼다(도메인이 실행 주체를 알고, 벤더별로 중복되지 않고, 실행 시점에 DB 에 쓸 수 있다).
- **레시피를 종결로 둔 이유**: 검색 결과를 모델에 되먹여 2차 답변을 받을 값어치가 작다. 카드가 이미 제목·출처·요약을 보여주므로 모델이 그걸 다시 말하면 중복이고 LLM 호출만 두 배가 된다.
  - ⚠️ 대가: 모델은 **결과를 보기 전에** 답을 쓰므로 그 자리에서 결과를 평할 수 없고, 0건·실패도 말해주지 못한다(카드가 빈 상태를 렌더해야 한다). 그리고 **툴만 부르고 텍스트를 안 낼 때가 있다** — 실측에서 관측됐다. 필요해지면 확인 후 완료 답변처럼 `TEXT` 를 한 줄 덧붙이는 방식으로 **계약을 안 바꾸고** 2차 호출로 승격할 수 있다.
- ⚠️ **한 턴에 툴은 하나뿐이다 — 병렬 툴콜을 일부러 껐다**(`openai-llm.service.ts` 의 `PARALLEL_TOOL_CALLS = false`). 벤더 기본값은 병렬인데, 도메인이 여러 호출을 합칠 방법이 없어서다: `pickInventoryCall` 은 첫 `update_inventory` 하나만 채택하고 나머지를 **버리는데**, 실측에서 모델이 한 턴에 두 번 불러 뒤 호출이 통째로 유실되는 걸 확인했다. 합치는 안은 접었다 — 뒤 호출이 앞 판단과 어긋나고(같은 재료가 add·consume 양쪽에), 확인 카드에 같은 재고 행이 두 줄 올라와 `ingredientId` key 가 충돌했다. **재고 유실은 조용한 데이터 손실**이라 눈에 보이는 불편보다 나쁘다.
  - 그래서 `update_inventory` 와 `search_recipes` 는 **같은 턴에 함께 나오지 못한다.** ("종결 툴이라 둘 다 살아남는다"는 이 플래그를 끄기 전 얘기였다.) 모델이 둘 다 하고 싶으면 한 턴에 하나씩 두 턴이 된다.
  - 같은 이유로 `pickRecipeCalls` 의 다중 호출 지원(한 턴 최대 2건)은 **OpenAI 경로에선 사실상 안 쓰인다.** Gemini 엔 이 옵션이 없어 여전히 병렬이 올 수 있으므로 방어는 양쪽 다 남겨둔다.
  - 되살리고 싶어지면 이 값을 되돌리기 **전에** 여러 호출을 병합하는 규칙부터 정할 것.
- **아이템 순서는 `exchangeWithTools` 가 정하고 `createdAt` 으로 고정한다** (텍스트 → 레시피 호출·결과 → 재고 카드). `@default(now())` 는 **트랜잭션 시각**이라 한 배치의 행이 전부 같은 값을 받는데, 그러면 정렬이 비결정적이 돼 말풍선이 카드 아래로 가거나 `function_call_output` 이 짝보다 앞서 재생돼 벤더가 400 을 낸다. 그래서 저장 직전에 1ms 씩 밀어 넣고, 기준 시각은 **직전에 저장한 사용자 메시지의 `createdAt`** 에 앵커한다(앱 시계가 DB 시계보다 뒤처져도 답이 질문보다 앞서지 않게).
- **레시피 검색 실패는 예외로 흘리지 않는다.** `RecipeService`(벤더 층)는 던지지만 `runRecipeSearches` 가 잡아 `{ recipes: [], reason: 'unavailable' | 'empty' }` 로 바꾼다 — 검색이 실패해도 대화가 죽지 않고, 다음 턴에 모델이 "결과가 없었다"와 "검색이 실패했다"를 구분해 말할 수 있다.
- `pickRecipeCalls` 는 재고와 달리 **여러 호출을 허용**한다(서로 다른 요리는 각각 별개 카드 묶음이라 충돌하지 않는다). 같은 요리는 하나로 줄이고, 한 턴 **최대 2건**으로 막는다 — 한 건이 네이버 호출 1회라 모델이 폭주하면 쿼터가 샌다.

아래는 재고 툴 이야기다. 추가(`add`)와 소비(`consume`)를 한 툴에 둔 이유는 "김치찌개 만들고 두부 샀어"처럼 둘이 동시에 오기 때문이다.

```
"김치찌개 먹었어"
 → 모델이 update_inventory 호출 (terminal → 실행 안 하고 루프 중단)
 → 서버가 resolve(이름→ingredientId·현재수량, 만료일 추정) 해서 FUNCTION_CALL 저장 → 확인 카드
 → 사용자가 편집·확인
 → 서버가 검증 → 재고 실제 변경 → FUNCTION_CALL_OUTPUT 저장
```

- **자동 차감을 하지 않는 게 방침이다.** 모델이 사용자가 말하지 않은 재료를 건드리는 게 실제로 관측됐고, 오차감은 사용자가 알아채기 어려워 신뢰를 크게 깎는다. 그래서 실행기가 사람이다.
- 소비는 **얼마 썼는지가 아니라 뭐가 남았는지**(`remaining`)를 받는다 — 산수는 재고를 프롬프트로 받은 모델이 하고 서버는 결과만 저장한다.
- **병렬 툴콜은 첫 호출만 채택한다**(`pickInventoryCall`). 벤더 기본값이 병렬이라 모델이 한 턴에 여러 번 부르는데, 관측된 호출들은 뒤로 갈수록 앞의 판단과 어긋났고(같은 소비가 두 번, 같은 재료가 add·consume 양쪽에), 전부 합치면 확인 카드에 같은 재고 행이 두 줄 올라와 `ingredientId` key 가 충돌했다. ⚠️ 대가로 모델이 **정당하게 나눠 부르면 뒷부분이 유실된다** — 그런 호출이 실제로 나오는지는 `ignored` 경고 로그로만 알 수 있으니, 잦으면 합치는 쪽으로 다시 판단할 것.
- **확인/취소**(`POST .../apply|dismiss`): 소유권 + **아직 미처리** 를 검증한다. "미처리" 판정은 상태 필드가 아니라 **같은 `callId` 의 `FUNCTION_CALL_OUTPUT` 이 없는 것**이다(상태를 따로 들고 있으면 두 기록이 어긋난다). 같은 요청이 두 번 와도 두 번째는 여기서 막힌다.
  - 클라가 보내는 건 **의도(편집값)** 이지 결과가 아니다. 재고를 바꾼 뒤 **실제로 반영한 것**으로 output 을 조립한다.
  - 본문은 제안과 같은 축(`{ consume, add }`)이고 **둘 다 서버가 저장해둔 제안 대신 이 값을 쓴다.** 소비·추가 모두 사용자가 카드에서 고칠 수 있어야 하기 때문이다(추가는 예전엔 확인-only 라 모델이 잘못 뽑으면 "그대로 확인 / 전체 취소" 두 갈래뿐이었다).
    - `consume` 은 **제안에 실제로 있던 `ingredientId` 만** 반영한다(임의 id 주입 차단). 이름이 아니라 id 인 이유는 제안과 확인 사이에 재고가 바뀌어도 사용자가 카드에서 본 그 행을 가리키기 위해서다.
    - `add` 는 대조하지 않는다 — **이름·수량을 고치는 게 목적이라 대조할 키가 없다.** 신뢰 경계 문제도 아니다(사용자는 어차피 `POST /inventory` 로 아무 재료나 넣을 수 있다). 방어는 DTO(`AddIngredientItemDto` **재사용** — 수동 추가와 같은 검증·같은 `LIMITS`)와 `inventory.add` 의 clip 이 한다.
    - 병합·만료일 폴백은 여전히 서버가 정한다. 클라는 _무엇을_ 보내고 서버는 _어디에 어떻게_ 넣을지를 정한다. `expiresAt` 은 사용자가 날짜를 직접 고른 경우에만 실려 오고, 아니면 서버가 재추정한다.
  - 응답은 `{ messages: [...] }` — 이번 처리로 새로 생긴 아이템들. 나중에 확인 후 LLM 완료 답변을 붙여도 **계약을 안 바꾸고** 배열에 한 줄 더 얹으면 된다(아직 미구현이라 확인 직후엔 컴패니언이 말하지 않는다).
- **레시피 카드는 `FUNCTION_CALL_OUTPUT.payload.output`** 에 그대로 들어간다(`{ dishName, recipes[], reason? }`) — 컬럼 추가 없이 `Message.payload` 구조를 그대로 쓴다. 앱은 아직 이 툴을 모르지만 **모르는 툴은 조용히 건너뛰므로** 안 깨진다(`toInventoryProposal` 이 `null` 반환). 카드 UI 는 그다음 단계.

## 장기 메모리 (Memory)

- 간판 기능 — "나를 기억하는 AI". `src/memory/`(`MemoryModule`). 대화에서 지속적 사실(식성·알레르기·조리도구·요리성향)을 뽑아 저장하고 다음 대화 프롬프트에 주입한다. **재고와 역할이 다르다** — 메모리는 "사람에 묶이는 지속 정보", 재고(`Ingredient`)는 "계속 변하는 상태". 아래 "냉장고 재고" 참고.
- **주입(recall)과 표시(list)를 분리한다**:
  - `recall(userId)` = "프롬프트에 넣을 메모리 선택" — **벡터 교체 seam**이다. 지금은 오래된 순 전부. 수가 많아지면 이 메서드 **내부만** 카테고리별 top-N → 유사도 top-k(pgvector `vector` 컬럼 추가)로 바꾼다. 호출자(Conversation)는 안 바뀐다. ⚠️ 그때도 **`ALLERGY` 는 자르지 말 것** — 안전 정보라 하나 빠지면 사람이 다친다.
  - `list(userId)` = "AI가 기억하는 나" 화면용 — 항상 전부(+`id` 포함, 삭제용).
- **추출(extractMemory)**: `ConversationService` 가 N메시지마다 **fire-and-forget** 호출(응답 지연 0). 최근 window개 메시지 → 기존 메모리와 함께 LLM 구조화 추출(`structured`) → 새 사실만 저장.
  - 방침: **지속적 사실만**(일회성 이벤트/약속 제외), **추가만**(갱신·모순 해결 안 함 — 사용자가 삭제로 교정), 중복은 **LLM(의미) + 코드(정확일치) 2중** 제거.
  - ⚠️ **재료 재고는 뽑지 않는다** — "계란 있음"은 냉장고(`Ingredient`)가 관리하고 메모리에 또 저장하면 두 기록이 어긋난다. 추출 지침 맨 앞에서 `"계란 알레르기가 있음"`(사람) vs `"계란 있음"`(재고)을 구분하라고 못박는다.
  - ⚠️ **과추출 경향이 있다.** 프롬프트가 "이런 걸 뽑아라"로 가득해서 모델이 빈 배열을 실패로 느낀다. 미추출은 사용자가 눈치채지 못한 채 간판 기능이 조용히 죽고, 과추출은 화면에서 보이고 삭제할 수 있다 — **비대칭이 과추출 쪽에 유리**해서 이 방식을 유지하되, "빈 배열이 정상"을 프롬프트 앞쪽으로 올리는 게 남은 개선이다.
  - **툴콜로 바꾸지 않은 이유**: `remember` 툴을 붙이면 `update_inventory`(종결 툴)와 같은 턴에 불렸을 때 **종결 분기가 먼저 반환해 실행되지 않고 버려진다**("계란 샀어, 나 계란 알레르기 있는데" 같은 문장이 정확히 그 케이스). 그리고 채팅 모델은 "기억하기" 같은 부드러운 툴을 잘 안 불러 미추출로 기운다.
  - 프롬프트·zod 스키마는 `memory.prompt.ts`(순수). 추출 스키마의 필드는 **`category`(enum 강제) + `content` 둘뿐**이다 — 뽑을 게 적을수록 category 판정이 정확해진다(특히 `ALLERGY`).
  - ⚠️ **추출 소스는 `TEXT` 행뿐이다** (`extractMemory` 의 `where` 에 `type: 'TEXT'`). 같은 테이블의 툴 행은 `role`·`content` 가 둘 다 null 이라, 필터가 없으면 transcript 에 `컴패니언: null` 이 섞이고 툴 행이 `MEMORY_EXTRACT_WINDOW` 정원을 잡아먹어 실제로 보는 말풍선 수가 준다. 트리거를 세는 `countText` 와 **같은 규칙**이니 한쪽만 고치지 말 것.
  - **컴패니언 답변도 함께 넣는다**(user 만 넣지 않는다). 이 앱은 능동 질문이 핵심이라 가장 좋은 기억이 "컴패니언이 묻고 사용자가 짧게 답한" 자리에서 나오는데, 질문을 빼면 `"응 있어"`·`"아니 좀 못 먹어"` 가 지시대상을 잃는다. 답변에서 사실을 뽑는 건 추출 프롬프트의 `[뽑지 말 것]` 이 막는다.
  - 백그라운드라 `extractMemory` 안에서 try/catch 로 에러를 삼키고 로깅만 한다 (위 "에러 처리" 원칙의 **의도적 예외** — 채팅 응답에 영향 0).
- 데이터: `Memory`(userId, `category`=`MemoryCategory` enum 5개, content). content는 짧은 사실 1개 = row 1개, 주입·표시 겸용.
  - **`importance`(1~3) 컬럼은 걷어냈다.** 무게를 카테고리가 이미 지고 있어서다 — 프롬프트가 `splitMemories` 로 카테고리별 섹션을 만들고 각 섹션을 **전부** 렌더하므로, 알레르기가 묻히지 않는 건 "중요도 3" 이 아니라 **"전용 블록이 맨 끝에 온다"** 가 보장한다. 정렬에만 쓰이면서 추출 LLM 이 매번 지어내야 하는 필드였다.
  - **`ALLERGY`(먹으면 안 되는 것)는 별도 카테고리**다. 예전엔 `PROFILE` 에 문장으로 저장하고 내용을 정규식(`/알레르기|못 먹|.../`)으로 훑어 골라냈는데, **안전 판별을 문자열 추측에 맡기는 구조**였고 부정문("우유 알레르기는 없음")을 구분하지 못해 없던 금지를 만들어내기도 했다.
  - `ALLERGY` 의 content 는 **재료·분류 이름만**("오이", "갑각류"). 문장이 아니다.
  - ⚠️ **정도 문제는 `ALLERGY` 가 아니다.** "우유를 많이 마시면 배가 아픔"을 여기 넣으면 우유가 영구 금지된다 → `PREFERENCE`. 추출 프롬프트가 이 경계를 명시한다.
  - ⚠️ 카테고리는 **추출 LLM 이 고른다** — 오분류하면 그 항목은 금지 목록에서 빠진다. 보조 정규식을 두는 안도 검토했으나 부정문 오탐과 렌더 혼재(이름 + 문장) 때문에 **카테고리만 믿기로** 했다.
  - 나머지: `PREFERENCE`(식성) / `PROFILE`(체질·상황·요리 실력) / `OWNERSHIP`(조리도구) / `ETC`.
  - Postgres 는 `ADD VALUE` 를 enum **끝에** 붙이므로, schema.prisma 선언 순서와 무관하게 `ALLERGY` 가 `category asc` 정렬에서 마지막이다(메모리 목록 화면 순서에 영향).
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
- 채팅 경로는 `InventoryService` 를 **직접** 호출한다(HTTP 안 탐). 아래 컨트롤러는 냉장고 화면의 **수동 교정 경로**다.
- **제안(비-mutating)과 반영(mutating)이 나뉘어 있다** — 채팅 툴이 종결 툴이라 확인 전엔 아무것도 쓰면 안 되기 때문이다.
  - `previewAdd`(기본 분류·보관 + 만료일 추정 + 기존 수량 `merge.existing`. 같은 이름이 여러 번 오면 **첫 번째가 이긴다**) / `resolveConsume`(이름→행 + 현재 수량, 같은 행 중복 제안 제거) → 확인 카드용
  - ⚠️ **`previewAdd` 는 모델이 보낸 `storage`(`FRIDGE`)를 의도로 믿지 않는다**(`pickStorage`). 툴 설명이 "이미 있는 재료는 생략하라"고 못박아도 모델이 매번 기본값을 채워 보내는 걸 실측했고, 그대로 두면 **냉동실 재료가 냉장으로 뒤집히고** 만료일까지 재추정된다(냉동 육류 180일 → 냉장 3일). `FREEZER`/`PANTRY` 는 기본값이 아니라 사용자가 말했을 때만 나오므로 존중한다. **보정은 제안 단계에서만** 하고, 사용자가 카드에서 고른 값은 `add()` 가 그대로 저장한다(사용자 의도 > 모델 추측).
  - **둘 다 DB 를 직접 안 보고 호출자가 읽은 재고 목록을 받는다**(순수·동기). 채팅 한 턴은 프롬프트 주입용으로 이미 재고를 읽으므로(`recall`), 그 스냅샷을 그대로 넘기면 같은 테이블을 다시 읽지 않는다 — 예전엔 한 턴에 `Ingredient` 를 **세 번**(프롬프트 + merge 근거 + 이름 매칭) 읽었다. 덤으로 **모델이 프롬프트에서 본 목록과 정확히 같은 목록**에 매칭돼 카드와 모델의 판단이 어긋날 여지가 없다.
  - 그래서 `recall` 은 프롬프트에 안 쓰는 `id` 도 함께 담는다 — 이 재사용이 없으면 `resolveConsume` 이 id 때문에 테이블을 또 읽어야 한다.
  - `add` / `applyConsume` → 확인 후 실제 반영.
  - **소비는 `finished` 와 `remaining` 두 값으로 갈린다**(세 갈래): `finished` → 소비(soft delete) / `remaining` 값 있음 → `quantityNote` 갱신 / **둘 다 아님 → 아무것도 안 함**(썼지만 얼마 남았는지 모름).
    - ⚠️ **`remaining=null` 하나가 "다 씀"을 겸하게 되돌리지 말 것.** 예전엔 그랬는데, **수량 메모가 없는 재고**를 일부만 쓴 경우("고추장 좀 썼어") 모델이 남은 양을 적을 방법이 없어 **재료가 통째로 사라졌다.** 실측으로 확인한 케이스다.
    - 제거는 `finished === true` **일 때만** 일어난다 — 값이 빠지면 유지 쪽으로 떨어진다. 잘못 지운 재고는 사용자가 알아채기 어렵기 때문에 위험한 쪽이 명시적 신호를 요구하게 뒀다.
    - 앱 카드의 "다 먹음" 토글이 곧 `finished` 이고, 입력칸을 비워두면 "수량 그대로"다(예전엔 비우면 삭제였다).
- API(`InventoryModule`, 전부 현재 유저 기준): `GET /inventory`(임박순), `GET /inventory/expiring?days=N`(홈 "먼저 먹어요"), `GET /inventory/options`, `POST /inventory`(여러 건), `PATCH /inventory/:id`(교정 — 만료일 직접 고치면 `USER` 승격, 표기일 없이 분류·보관만 바꾸면 만료일 재추정. 유통기한 직접 편집이 없는 앱에선 보관 변경이 유일한 간접 조정 수단), `DELETE /inventory/:id`(=consume, soft), `POST /inventory/:id/restore`, `DELETE /inventory/:id/hard`. `:id` 라우트는 반드시 리터럴 경로(`options`/`expiring`) **아래**에 둔다(Nest 는 선언순 매칭).

### 영수증·사진 스캔 (`POST /inventory/scan`)

이미지에서 재료를 뽑아 **제안만** 돌려준다. 저장은 사용자가 확인 화면에서 `POST /inventory` 로 한다 — 채팅 툴과 **같은 방침**이다(오인식이 반드시 있고, 잘못 들어간 재료는 사용자가 알아채기 어렵다).

```
이미지 → (OCR) → LLM(구조화 출력) → previewAdd → 제안 목록 → [사용자 확인·수정] → POST /inventory
```

- **뒷단을 그대로 재사용한다**: `previewAdd` 가 기본값·만료일 추정·이름 중복 제거를 흡수하고, 결과 타입도 채팅 확인 카드와 같은 `AddProposalItemType` 이다. 그래서 LLM 은 `{name, category, purchased, total, storage, expiresAt}` 만 내면 된다.
- **`ScanService.scan()`(이미지 단독) / `scanWithOcr()`(OCR+이미지)** 두 경로를 유지한다. 요청의 `ocr=true` 로 고르며, **모델을 바꿔가며 비교**하기 위한 스위치다(OpenRouter·NVIDIA 등). 앱은 현재 `ocr=true` 를 보낸다.
- 업로드는 **multipart**(`FileInterceptor('image')`, 10MB 상한). base64 는 33% 부풀고 Nest 기본 body limit 에 걸린다. base64 변환은 OpenAI 로 보낼 때 서버에서 한 번만 한다.
- 개발용으로 `SCAN_DEBUG_DIR` 을 주면 **받은 이미지를 그대로 파일로 떨군다**. "모델이 못 읽은 건지, 애초에 이미지가 뭉개진 건지"를 가르는 데 이게 제일 빠르다. 비어 있으면 아무것도 안 한다(프로덕션에서 사용자 사진이 디스크에 안 남게).
- 모델은 `SCAN_MODEL`(비우면 `LLM_MODEL`) — 채팅 비용을 안 올리고 인식 모델만 올릴 수 있다.

**프롬프트에서 아프게 배운 것 (`scan.prompt.ts`)**

- **현재 재고는 `input` 이 아니라 `instructions` 에 넣는다.** 영수증에서 뽑을 대상이 아니라 합산 판단용 배경이라서다. 입력에 섞으면 모델이 그걸 **영수증 품목으로 착각해 없는 걸 뽑아낸다.**
- **`total`(등록 후 총량)은 항상 채우게 한다** — 냉장고에 없던 재료면 `purchased` 와 같은 값. 조건부 필드("있을 때만 채워라")는 작은 모델에서 자주 비고, 비었을 때 `"없음"` 같은 문자열이 들어왔다.
- ⚠️ **Structured Outputs 는 타입만 강제한다.** `z.string().nullable()` 이어도 모델이 `"null"`·`"없음"` 을 넣으면 **유효한 string 이라 통과**하고, 그대로 저장돼 화면에 `없음` 으로 보인다. 그래서 서버가 `clean()` 으로 센티넬 문자열을 걸러낸다(산수가 아니라 경계 방어 — `parseArgs` 가 깨진 JSON 을 막는 것과 같은 성격).
- 합산은 **모델이 한다**(서버 산수 아님). 대신 이미 있는 재료인데 `total === purchased` 면 **"합산 누락 의심" 경고를 남긴다** — 값은 안 바꾸고 빈도만 관측한다. 잦아지면 서버 합산으로 옮길 근거가 된다.

**⚠️ 알려진 한계 — 병합이 만료일을 덮어쓴다**

같은 이름은 한 행으로 합쳐지고 만료일은 **새로 산 값**이 이긴다(`add()` 의 재입고 규칙). 그래서 `8/4까지 남은 앞다리살 + 오늘 산 8/11까지` 가 합쳐지면 **먼저 상하는 몫이 임박 경고에서 빠진다.** 유통기한이 다른 두 묶음은 한 행으로 표현되지 않는 게 근본 원인이라, "기존에 합치기 / 따로 추가" 선택을 넣을 때 함께 해결한다. (그때 주의: **이름이 사실상 식별키**라 같은 이름 행이 둘 생기면 `resolveConsume`·`add` 의 `byName` Map 이 하나만 남겨 나머지가 조용히 접근 불가가 된다.)

## OCR (`src/ocr/`, NAVER CLOVA)

- `OcrService.readText(image)` → **문자열 하나**. 벤더 격리는 `recipe/`(네이버 검색)와 같은 패턴 — 원본 응답(필드 배열·좌표·신뢰도)과 호출 에러를 여기서 흡수한다.
- ⚠️ **실패해도 예외를 던지지 않는다.** 키가 없거나·호출이 실패하거나·인식이 실패하면 빈 문자열을 돌려주고 **스캔은 이미지 단독으로 계속된다**. OCR 은 정확도를 올리는 보조 수단이지 필수 경로가 아니다("에러 처리" 원칙의 의도적 예외).
- env(`NAVER_OCR_INVOKE_URL`/`NAVER_OCR_SECRET`)는 **선택**이다 — `env.validation.ts` 에 필수로 넣지 않는다. 그래야 키 없는 환경(CI·다른 개발자)에서도 서버가 뜨고 테스트가 돈다. ⚠️ 이 값은 **NCP 콘솔**에서 발급하며, 네이버 개발자센터의 `NAVER_CLIENT_ID/SECRET`(쇼핑검색)과 **완전히 다른 자격증명**이다.
- 요금제 주의: **General OCR** 을 쓴다. Document OCR(영수증 특화)은 구조화 필드를 주지만 **호출이 0이어도 월 기본료**가 붙는다 — 어차피 정규화·필터링은 LLM 이 하므로 고정비를 낼 이유가 없다.
- **줄 복원(`ocr.lines.ts`, 순수 + 스펙)** 이 품질을 크게 좌우한다. Clova 는 글자를 조각 단위로 주는데, 영수증은 `품명 ... 금액` 2단이라 그냥 이어붙이면 열이 뒤섞여 모델이 품명과 금액을 잘못 짝짓는다. **`lineBreak`(벤더가 주는 줄 끝 신호)를 우선**하고, 그 신호가 전혀 없을 때만 y 좌표로 묶는다.

## 레시피 검색 (Recipe, v1.1)

- `src/recipe/`(`RecipeModule`). `RecipeService.search(dishName)` 이 **네이버 검색 API**를 호출해 **정규화된 `RecipeType[]`**(packages/types) 로 반환한다.
- **역할 분담이 요점이다**: 요리 추천과 기본 조리법은 계속 **모델 내장 지식**이 하고, 이 검색은 사용자가 **"자세한 레시피 보여줘"라고 요청할 때만** 붙는다. 그래서 여기서 하는 일은 "글 목록 찾기"까지고 **조리법 본문은 링크 너머**에 있다 — 검색 API 가 주는 건 제목·링크·요약뿐이다.
  - 덤으로 이게 **쿼터 대책**이기도 하다. 추천할 때마다 검색하면 유튜브(하루 100회)는 반나절이면 마르는데, 명시적 요청에서만 부르면 호출이 한 자릿수로 떨어진다.
- **벤더(네이버) 격리**: 원본(HTML `<b>` title, `bloggername`, `postdate`)과 호출 에러를 이 서비스 안에서 흡수해 `RecipeType` 으로 변환한다 — `openai` 가 `llm/` 에, CLOVA 가 `ocr/` 에 갇히는 것과 같다. 프로바이더가 **2개 이상**(만개의레시피 크롤링 등) 되면 그때 인터페이스+DI토큰으로 분리한다(과한 추상화 지양).
- **기본 소스는 웹문서(`webkr`)** 다. 같은 질의로 실측해보면 `blog` 는 제목이 블로그 홍보 문구에 가깝고 요약이 해시태그 조각인 반면, `webkr` 은 전문 레시피 사이트(만개의레시피·우리의테이블)가 잡히고 **요약에 재료 목록이 실려 온다**(모델이 어느 글을 짚을지 고르는 근거가 된다). `blog` 는 `source` 파라미터로 남겨뒀다 — 바꾸는 비용이 서비스 경로 하나라서.
- **질의어는 요리명 그대로가 아니라 `"{요리명} 레시피"`** 다. "김치찌개"만 넣으면 맛집·식당 글이 섞인다.
- **자격증명은 쇼핑과 같은 `NAVER_CLIENT_ID/SECRET`** 이다(네이버 검색 API 전체 공통). 그래서 레시피 검색을 붙이면서 **새 env 가 늘지 않았다.**
- ⚠️ **실패하면 예외를 던진다**(벤더 층이라 그게 맞다). 채팅에서 쓸 때는 **호출자(툴 실행기)가 감싸서** "결과 없음 / 일시 실패 / 쿼터 소진"을 구분한 구조화 결과로 바꿔 모델에 넘긴다 — 예외를 그대로 흘리면 툴 루프가 세 상황을 `{ error: '도구 실행에 실패했습니다.' }` 한 문자열로 뭉개서, 모델이 재시도할 가치가 있는지 판단하지 못한다(쿼터 소진에 재시도하면 남은 라운드만 태운다).
- `GET /recipes?dish=김치찌개` 는 **임시 테스트용**(LLM 없음, 가드 없음) — 검색 품질을 채팅 안 거치고 눈으로 보기 위한 것. `source=blog`·`limit` 도 받는다. **앱에서 직접 레시피를 검색하는 기능**을 붙일 때 `JwtAuthGuard` 를 함께 붙인다(그때부터 네이버 쿼터를 태우는 공개 프록시가 되므로).
- **페이징은 아직 없다.** "다른 레시피 더" 가 필요해지면 그때 넣는다 — 상품 검색의 커서 페이징(`Conversation.lastSearch`)은 쓰는 데가 없어져 컬럼째 제거했다.

## 사용량 계측 (Usage, `src/usage/`)

LLM 호출 1건 = `LlmUsage` 행 1개. **지금은 계측만 하고 제한은 없다.** 구독제를 붙일 때 무료 한도를 얼마로 둘지는 추측이 아니라 이 데이터의 분포(p75~p90)를 보고 정한다 — **한도는 올리긴 쉽고 내리긴 최악**이라 먼저 재고 나중에 막는다.

- **기록 지점은 `LlmService` 하나다.** "모든 LLM 호출은 `LlmService` 를 통한다"가 이미 규칙이라 여기 두면 **커버리지가 구조로 보장된다.** 호출자가 각자 기록하면 create 모양이 3벌로 복제되고, 무엇보다 **기록을 빠뜨리는 실패는 조용하다** — 네 번째 호출 지점에서 안 붙여도 아무것도 안 깨지고 원장만 소리 없이 빈다. 몇 달 뒤 원가를 보려는 순간에야 알게 되는데 그땐 backfill 이 불가능하다.
- 그래서 세 메서드가 `UsageContextType` 을 **필수 인자**로 받는다 — 컴파일러가 `billable` 판단을 강제한다. 쓰기 자체는 `UsageService` 가 소유한다(`llm/` 이 DB·영속성을 모르게 유지, 벤더 격리와 같은 이유).
- **`billable` 은 `feature` 에서 파생하지 않는다.** "원가는 전부, 쿼터는 유저가 시킨 것만"이라 두 질문이 다르고, 같은 `chat` 인데 갈리는 경우가 있어 재구성이 안 된다(우리 쪽 오류로 인한 재호출 등).
  - ⚠️ **메모리 추출은 `billable: false`.** 유저가 시킨 적이 없다. 여기서 한도를 깎으면 `MEMORY_EXTRACT_EVERY_N` 을 6→3 으로 튜닝하는 순간 **모든 유저의 한도가 조용히 줄어든다**(서버 노브가 요금제를 바꾼다).
  - `LlmUsage.billable` 에 `@default` 를 일부러 안 준다 — 새 호출 지점이 판단을 건너뛰지 못하게.
- **기록은 fire-and-forget 이고 실패를 삼킨다** ("에러 처리" 원칙의 의도적 예외 — 회계 기록 때문에 채팅이 죽거나 느려지면 안 된다). 정확히 그래서 **안 돌아도 아무것도 안 깨지고**, `usage.service.spec.ts` 로 고정해뒀다.
  - ⚠️ 벤더 호출이 실패하면 `usage` 가 안 돌아와 **그 토큰은 원장에 안 잡힌다** — 원장이 실제 청구서보다 조금 작게 나오는 이유가 여기다.
  - `model` 은 요청한 이름이 아니라 **벤더가 실제로 썼다고 답한 값**(`res.model`)을 남긴다. 별칭이 구체 버전으로 해석될 수 있어, 나중에 단가를 곱하려면 이 값이어야 한다.
- **원장은 append-only 고, 무엇으로도 지워지지 않는다.** 돈은 이미 썼고 유저가 대화를 지우거나 탈퇴한다고 그 지출이 없던 일이 되지 않는다 — 지난달 결산을 뽑아둔 뒤 누가 탈퇴했다고 지난달 총액이 줄면 그건 원장이 아니다.
  - `conversationId` 는 **FK 를 아예 안 건다**(매달린 id 가 되는 게 정상 — 영수증은 없어진 가게도 가리킨다). 이 앱은 매 턴 히스토리를 통째로 재생하므로 "긴 대화가 실제로 얼마나 비싼가"를 곧 묻게 되는데, 이 값이 없으면 물어볼 방법이 없다.
  - ⚠️ **`userId` 는 이 레포에서 유일하게 `onDelete: SetNull` 인 관계다**("회원탈퇴 = 전부 cascade" 의 유일한 예외). 이 표엔 대화 내용이 없고(토큰 수·모델명·시각뿐) 사람과 잇는 유일한 끈이 `userId` 라, 끊으면 돌아갈 곳 없는 cuid 만 남아 재연결이 불가능하다 — **행을 지우는 대신 익명화**하는 것이고, 덕분에 과거 원가 집계가 안 흔들린다.
  - 유료화 시점에 **결제·거래 기록 보존 의무**를 확인할 것(네이버 API 이용 조건 재확인과 같은 트리거).
- **집계 테이블(카운터)을 미리 만들지 않는다.** 원장과 카운터 두 기록이 어긋나는 고전적 버그를 떠안고("상태를 따로 들고 있으면 두 기록이 어긋난다" — 확인 카드와 같은 판단), 유저 한 명이 한 달에 쌓는 행은 수백 개 규모라 `@@index([userId, createdAt])` 위 집계로 충분하다(뒤에 수 초짜리 LLM 호출이 붙으므로 1ms 는 측정되지도 않는다).
  - 진짜 아파지면 `UsageCounter(userId, period '2026-08')` 를 캐시로 얹는다. **`User` 컬럼 + 매월 초기화는 하지 말 것** — ① 초기화 주체가 없다(크론 인프라 없음, lazy reset 은 경합이 생긴다) ② 리셋하면 과거가 사라져 한도를 정할 근거를 잃는다 ③ `User` 는 로그인·프로필로 계속 읽고 쓰는 뜨거운 행이라 매 호출 UPDATE 는 경합을 만든다. 기간 키로 **행을 나누면 초기화라는 개념 자체가 없어진다.**
  - 방향은 원장 → 카운터만 가능하다(backfill 가능). 반대는 안 된다.
- 유저에게 보여줄 단위는 **토큰이 아니라 횟수**로 가는 게 좋다(대화 N턴·스캔 N장). 유저는 토큰을 모르고, `LLM_MODEL` 을 바꾸면 같은 행동의 토큰이 달라져 약속한 한도가 저절로 흔들린다. 토큰은 **내부 원가 전용**이다.

## 인증 — 로그인(JWT access + refresh)

- `src/auth/`(`AuthModule`, `@Global`). loginId/password 로그인 + JWT 기반 세션.
- **토큰 2종**:
  - **access token** = JWT(서명, payload `{ sub: userId, type:'access', iss:'companion' }`), 짧은 수명(`JWT_ACCESS_TTL`, 기본 15분). 모든 API 요청의 `Authorization: Bearer` 로 사용. `JwtAuthGuard` 가 서명·만료·`issuer` 를 검증하고 **payload 형태도 런타임 확인**(`sub` 가 비어있지 않은 문자열 + `type==='access'`)한 뒤 `req.userId` 에 심는다. (서명만 통과한 이상 토큰이 `req.userId=undefined` 로 흘러 소유권 쿼리를 오작동시키는 것 방지)
  - **refresh token** = 랜덤 문자열(hex 64자), 긴 수명(`REFRESH_TTL_DAYS`, 기본 30일). access 재발급(`POST /auth/refresh`)에만 쓰고 일반 API엔 안 쓴다. 원문은 저장하지 않고 **sha256 해시만** `RefreshSession` 에 저장(DB 유출 시 원문 복원 방지).
- `@CurrentUser()` 데코레이터로 컨트롤러에서 `req.userId` 를 꺼낸다. 모든 유저 스코프 라우트는 이 값 기준. (가드가 `DevAuthGuard`→`JwtAuthGuard` 로 바뀌었지만 `req.userId` 계약이 같아 컨트롤러/서비스는 무변경.)
- **회전(rotation)은 원자적**: `refresh` 는 옛 세션 삭제+새 세션 생성을 **`$transaction` 으로 묶고 `deleteMany` 의 count가 정확히 1일 때만** 성공시킨다 → 같은 refresh 로 동시 요청이 와도 진 쪽은 count 0 → 재사용 401(500 아님). 탈취된 옛 refresh 재사용도 401. **로그아웃**(`POST /auth/logout`)은 해당 refresh 세션을 삭제(멱등).
- **AuthService**:
  - `signup` — 유저 + **`LOCAL` 신원** + 최초 세션을 **한 트랜잭션**으로(반쪽 가입 방지). 중복은 사전조회 없이 **unique 제약(P2002)→`ConflictException`** (동시 가입 경합도 안전).
  - `login` — 유저가 없어도 **더미 해시로 `bcrypt.compare` 를 수행**(계정 열거 타이밍 공격 방지), 실패 메시지도 동일. 성공 시 만료된 세션을 기회적으로 정리.
  - `getCurrentUser`(=`GET /auth/me` 로직), `refresh`, `logout`. bcrypt 는 순수 JS `bcryptjs`.
- API: `POST /auth/signup|login|refresh|logout`(가드 없음), `GET /auth/me`(`JwtAuthGuard`). signup/login 은 `{ accessToken, refreshToken, user }` 반환.
- env: `JWT_SECRET`(≥16자, 프로덕션은 무작위로 교체 필수), `JWT_ACCESS_TTL`, `REFRESH_TTL_DAYS`. **시작 시 `config/env.validation.ts`(zod, `ConfigModule.validate`)로 검증** — 빈 secret·NaN TTL·프로덕션의 `change-me` 면 부팅을 차단한다. `JwtModule` 은 `global: true` 로 등록해 각 모듈의 `@UseGuards(JwtAuthGuard)` 가 `JwtService` 를 주입받게 한다.
- 데이터: `RefreshSession`(userId, `tokenHash` @unique, expiresAt), `User`(`email` @unique, `emailVerified`, `passwordHash?`), `AuthIdentity`.
- **미구현(배포 전)**: 로그인/회원가입 rate limit(`@nestjs/throttler`) — 브루트포스·bcrypt CPU 소모 방어.

### 로그인 수단 — 이메일(`LOCAL`) + 소셜 (`AuthIdentity`)

**로그인 키는 이메일**이다(예전 `loginId` 임의 문자열은 제거). 그리고 **로그인 수단은 `User` 가 아니라 `AuthIdentity` 가 1:N 으로** 들고 있다 — 한 사람이 수단을 여러 개 가질 수 있어서다(카카오로 가입했다가 나중에 구글 연결). 자세한 근거는 schema.prisma 의 두 모델 주석 참고.

- **`email` 은 인증 수단이 아니라 "사람 동일성"의 축**이다. 카카오 id 와 구글 id 는 서로 무관해서, 이메일이 없으면 같은 사람이 두 수단으로 로그인했을 때 동일인인지 알 방법이 없다 → 계정이 갈라지고 **재고가 한쪽에만 쌓인다**(이 앱에선 치명적). 그래서 NOT NULL 이고, 소셜이 이메일을 안 주면 **가입을 거부**한다.
- **이메일 정규화(`auth/email.ts`)는 단일 출처**다. 저장·조회·검증이 같은 규칙을 써야 `Kim@x.com` 과 `kim@x.com` 이 두 계정이 되지 않는다.
  - ⚠️ **DTO 의 `@Transform` 이 `@IsEmail()` 보다 먼저 다듬어야 한다.** 검증은 원본을 보므로 trim 을 안 하면 앞뒤 공백이 붙은 이메일이 "형식 오류"로 거절된다(실측). 서비스도 같은 함수를 부르는데, 멱등이고 **소셜 경로는 DTO 를 안 거치므로** 양쪽 다 필요하다.
- `login` 은 **`passwordHash` 가 null 이면(=소셜 전용 유저) 같은 401** 로 거절한다. 다른 에러로 흘리면 응답만 보고 "이 이메일은 카카오로 가입돼 있다"를 알아낼 수 있다(계정 열거).
- provider 어휘의 단일 출처는 **`auth/providers.ts`**(`PROVIDER_VALUES`/`LOCAL_PROVIDER`/`SOCIAL_PROVIDER_VALUES`). DB 는 String 컬럼이라 값을 강제하지 못한다. **애플 추가 = 여기 한 줄, 마이그레이션 불필요.**
- ⚠️ **이메일이 같다고 자동 병합하지 말 것.** provider 가 그 이메일 소유를 검증했는지 보장할 수 없어 계정 탈취 경로가 된다. 충돌하면 **막되 잠기지 않게** 한다 — "이미 카카오로 가입된 이메일이에요"처럼 **어느 수단으로 가입했는지 알려주면**(`AuthIdentity` 목록으로 판정) 사용자는 항상 원래 수단으로 들어올 수 있다. 병합은 나중에 로그인된 상태의 "계정 연결"로만 연다.
  - ⚠️ 애플의 Private Relay 주소는 앱마다 달라 다른 provider 의 이메일과 **절대 일치하지 않는다** — 애플 유저의 동일인 판정은 이메일로 안 되고 명시적 연결이 답이다.
- **미구현**: 소셜 로그인 자체(카카오→네이버→구글), 이메일 인증(발송·코드 테이블). 소셜을 붙일 때 **앱은 토큰이 아니라 인가코드를 보내고 서버가 provider 에 확인**해야 한다 — 앱이 `providerUserId` 를 직접 보내면 아무나 남의 계정으로 들어온다(신뢰 경계).

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

- 유닛 테스트는 `*.spec.ts`(예: `auth.service.spec.ts`) — 서비스 로직만 떼어 Prisma/JWT 를 mock 해 검증(런타임 코드 아님, `tsconfig.build.json` 이 `**/*spec.ts` 를 제외해 빌드 산출물에 안 들어간다). e2e 는 `test/*.e2e-spec.ts`.
- **스펙을 만드는 기준**: 손으로 재현하기 어렵거나, 실패해도 눈에 안 보이는 것만 고정한다.
  - ✅ 만든다 — refresh 토큰 동시 요청 경합·계정 열거 타이밍(auth), 자정 경계 날짜 계산(shelf-life), **실측으로 배운 순서 규칙**(알레르기 블록이 맨 끝), 줄 복원·툴콜 선택 같은 순수 변환
  - ❌ 안 만든다 — **프롬프트 문구**. 앞으로 계속 다듬을 것이라 스펙이 매번 깨져 오히려 방해가 된다. 문구가 아니라 **데이터가 문자열로 렌더되는 로직**만 볼 가치가 있다.
  - 스펙을 안 만들기로 했으면 **"스펙으로 고정된다"는 주석도 함께 지운다** — 없는 안전망을 있다고 적어두면 다음 사람이 속는다.
- `lint` 는 **검사만**(`--fix` 없음), 자동수정은 `lint:fix`. CI 가 위반을 잡아야 하므로 둘을 분리한다.
- 레포 루트 `pnpm verify` = `format:check → lint → typecheck → test → test:e2e → build`. **push 전에 이걸 돌린다.** CI(`.github/workflows/ci.yml`)도 동일 체인 + 더미 env(로컬 `.env` 없이 부팅되도록)로 실행한다.
  - `typecheck`(`tsc --noEmit`)는 **`build` 가 안 보는 것까지 본다** — `tsconfig.build.json` 이 `*.spec.ts` 를 제외하므로 스펙의 타입 오류는 빌드로는 안 잡힌다.
- 테스트에서 `expect(p).rejects.toBeInstanceOf(X)` 쓸 때 `X`(예외 클래스)를 **반드시 import** — 안 하면 `toBeInstanceOf(undefined)` 가 동기 throw → 미처리 rejection 으로 Node 가 워커를 죽인다.

## 개발 워크플로우 주의

- 개발 서버는 `pnpm start:dev`(`nest start --watch`). 끄면 4000 포트가 닫혀 native가 `ERR_CONNECTION_REFUSED` 를 받는다 — 권한 문제가 아니라 백엔드가 안 떠 있는 것.
- 가끔 `Cannot find module './app.module'` 로 죽었다 살아나는 건 **watch 재빌드 도중의 빈 창** 때문이다: `deleteOutDir`(nest-cli) 가 dist를 통째로 비우고 다시 컴파일하는 사이 `main.js` 는 있는데 `app.module.js` 가 아직 없는 타이밍에 재시작되면 크래시 → 빌드 끝나면 복구. **배포(한 번 build → `node dist/main`)에는 없는 문제**다.
  - 특히 watch가 도는 중 `prisma generate`/`pnpm db:migrate` 를 돌리면 `src/generated/prisma` 무더기 변경으로 재빌드 폭풍이 나서 잘 터진다 → **watch를 끈 상태에서** generate/migrate 하는 걸 권장.
  - 정 거슬리면 `nest-cli.json` 의 `deleteOutDir: false`(제자리 덮어쓰기로 빈 창 제거) 옵션도 가능. 필수는 아님.
