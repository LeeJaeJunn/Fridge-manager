# Companion — 자취생을 위한 냉장고 관리 AI 컴패니언

자취생의 **냉장고 재고를 기억**해 **뭘 해먹을지 함께 정해주는** 모바일 앱. 재고·식성을 기억하고, 있는 재료로 만들 수 있는 요리를 추천한다.

- 제품 방향·원칙·로드맵은 루트 `README.md` 가 단일 출처다. (여기 "MVP 로드맵"은 그 요약)
- **"컴패니언" = 나를 기억하는 개인화**지 연인 롤플레이가 아니다. 기억 대상은 **사용자**(냉장고 재고·식성·알레르기·조리도구)이며, 상세 캐릭터 설정(관계·성별·연인 페르소나)은 **조언자 톤 + 사용자 프로필**로 축소한다.

## 모노레포 구조 (pnpm workspace)

```
companion/
├─ apps/
│  ├─ native-companion/   # 모바일 앱 (React Native + Expo + TS)
│  └─ nest-companion/     # 메인 백엔드 (NestJS + TS)
├─ packages/
│  └─ types/              # 앱 간 공유 타입 (@companion/types) — 클라이언트↔서버 API 계약
└─ (root)                 # 워크스페이스 오케스트레이터: prettier, vscode, ci
```

- 패키지 매니저: **pnpm**. Expo/Metro 호환을 위해 **`pnpm-workspace.yaml` 에 `nodeLinker: hoisted`** 필수 (없으면 `react-native-css-interop` 등 transitive 의존성을 Metro 가 못 찾음). pnpm 11 은 이 설정을 `.npmrc` 가 아니라 `pnpm-workspace.yaml` 에서 읽는다.
- 포매팅: 루트 `prettier` + `prettier-plugin-tailwindcss` (루트에서 `pnpm format`)
- 에디터 설정: 루트 `.vscode/` (워크스페이스 전체 공통)
- CI/검증: `.github/workflows/ci.yml` 이 **`pnpm verify`**(= `format:check → lint → **typecheck** → test → test:e2e → build`)를 돌린다. push 전에 로컬에서 `pnpm verify` 로 같은 체인을 확인한다.
  - ⚠️ **`typecheck` 가 없으면 네이티브 앱은 타입 검사를 아무도 안 한다.** `test`·`build` 는 `--if-present` 라 스크립트가 없는 native 를 건너뛰고, `expo lint` 는 eslint 라 타입을 안 본다. 실제로 `loginId`→`email` 전환 때 **앱이 타입 에러 6개인 채로 verify 가 통과**했다. 두 앱 모두 `typecheck: tsc --noEmit` 을 갖고 있어야 한다.

## 백엔드 방침

- 단일 백엔드 **NestJS(TS)** 로 간다. 처음부터 서버를 둘로 쪼개지 않는다.
- **데이터 스택: Postgres + Prisma (확정).**
  - 로컬 개발은 Docker(`apps/nest-companion/docker-compose.yml`, `pgvector/pgvector` 이미지)로 띄운다. 프로덕션은 관리형(Neon/RDS 등)으로 가고, 앱은 `DATABASE_URL` 만 바꾸면 된다.
  - ORM은 **Prisma**. 스키마·마이그레이션·연결 세부와 주의사항은 `apps/nest-companion/AGENTS.md` 참고.
  - 냉장고 재고는 자유텍스트 메모리가 아니라 **별도 테이블(`Ingredient`)** 이다 — 상태가 계속 변하고 "유통기한 임박" 같은 날짜 쿼리가 필요해서다. 자세한 건 `apps/nest-companion/AGENTS.md` 참고.
  - 벡터: pgvector 이미지를 쓰지만 **장기 메모리(식성·알레르기·조리도구)는 아직 소수라 벡터 유사도 검색이 불필요** (메모리 전부를 프롬프트에 주입). 실제 필요해지면 `vector` 컬럼만 추가한다.
- 임베딩/LLM은 API 호출(TS SDK)로 처리.
- 로컬 ML 모델·커스텀 스코어링이 실제로 필요해지는 시점에만 해당 기능을 FastAPI로 분리.

## MVP 로드맵

1. **냉장고 관리 + 레시피 추천** (첫 출시, v1): 로그인 / 재료 **기억**(채팅 "계란 샀어" → 재고 등록, 유통기한 자동 추정) / 식성·알레르기·조리도구 **기억** / 있는 재료 + 임박 재료 우선으로 **요리 추천**(LLM 내장 지식) / 만들면 재고 **차감**
   - 차별점(북극성) = **재고를 진짜로 들고 있는 기억 + 능동적 구조화 질문(몇 인분·조리시간) + 알레르기 안전.** 기억이 장식이 아니라 필수 인프라가 되는 게 이전 방향과의 차이.
   - v1 스코프 = **재고 + 유통기한 + LLM 레시피 추천.** 외부 API 의존 0 (레시피 검색은 v1.1). 슈퍼앱 함정 방지.
2. **v1.1 레시피 리서치**: 요리 추천·기본 조리법은 계속 모델 내장 지식으로 하고, 사용자가 **"자세한 레시피"를 요청할 때만** 네이버 검색으로 실제 글을 찾아 카드로 보여준다(`recipe/`). 유튜브는 그다음 — Data API 쿼터(하루 10,000 units, `search.list` 100/회)가 하루 100회뿐이라 붙일 때 요리명 캐싱이 함께 필요하다.
3. **수익화**: 현재는 **비상업**(광고·어필리에이트 없음)이라 네이버 오픈 API 를 쓸 수 있다. 수익화 시점에 **네이버 오픈 API 이용 조건을 다시 확인**해야 한다.

> 방향 전환 메모: "AI 캐릭터챗 → 추천 → 커머스" → "기억형 구매 의사결정 에이전트" → **"자취생 냉장고 관리 컴패니언"**. 구매 결정은 저빈도라 리텐션이 약하고 기억이 없어도 돌아가는(=ChatGPT 래퍼) 문제가 있었다. 냉장고는 상태가 계속 변해 앱이 기억을 들고 있지 않으면 기능 자체가 성립하지 않고, 주 단위로 돌아온다. 인프라(인증·LLM 라우터·메모리·툴콜 루프·모바일)는 그대로 재활용한다. 상품 검색(구 `commerce/`)은 v1.2 로드맵과 함께 제거했고, 그 네이버 호출 계층이 `recipe/` 의 뼈대가 됐다(필요하면 git history 참고).

## 규칙

- 앱별 전용 설정(tsconfig, app.json, Expo 지침 등)은 각 앱 디렉터리에 둔다. 이 루트 문서는 **레포 전체** 규칙만 다룬다.
- `apps/native-companion/AGENTS.md` 에 Expo 전용 지침이 별도로 있으니 네이티브 작업 시 함께 참고.
- `apps/nest-companion/AGENTS.md` 에 백엔드(LLM 추상화·에러 처리·보안) 지침이 별도로 있으니 백엔드 작업 시 함께 참고.
