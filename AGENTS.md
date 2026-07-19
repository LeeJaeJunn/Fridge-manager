# Companion — 나를 기억하는 AI 의사결정 컴패니언

대학생의 **상황·취향을 기억**해 **의사결정을 도와주는** 모바일 앱. 첫 도메인은 **구매 결정**, 이후 다른 결정 영역으로 확장.

- 제품 방향·원칙·로드맵은 루트 `README.md` 가 단일 출처다. (여기 "MVP 로드맵"은 그 요약)
- **"컴패니언" = 나를 기억하는 개인화**지 연인 롤플레이가 아니다. 기억 대상은 **사용자**(취향·예산·이력)이며, 상세 캐릭터 설정(관계·성별·연인 페르소나)은 **조언자 톤 + 사용자 프로필**로 축소한다.

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
- CI/검증: `.github/workflows/ci.yml` 이 **`pnpm verify`**(= `format:check → lint → test → test:e2e → build`)를 돌린다. push 전에 로컬에서 `pnpm verify` 로 같은 체인을 확인한다.

## 백엔드 방침

- 단일 백엔드 **NestJS(TS)** 로 간다. 처음부터 서버를 둘로 쪼개지 않는다.
- **데이터 스택: Postgres + Prisma (확정).**
  - 로컬 개발은 Docker(`apps/nest-companion/docker-compose.yml`, `pgvector/pgvector` 이미지)로 띄운다. 프로덕션은 관리형(Neon/RDS 등)으로 가고, 앱은 `DATABASE_URL` 만 바꾸면 된다.
  - ORM은 **Prisma**. 스키마·마이그레이션·연결 세부와 주의사항은 `apps/nest-companion/AGENTS.md` 참고.
  - 벡터: pgvector 이미지를 쓰지만 **MVP1은 장기 메모리 ~5개라 벡터 유사도 검색이 아직 불필요** (메모리 전부를 프롬프트에 주입). 실제 필요해지면 `vector` 컬럼만 추가한다.
- 임베딩/LLM은 API 호출(TS SDK)로 처리.
- 로컬 ML 모델·커스텀 스코어링이 실제로 필요해지는 시점에만 해당 기능을 FastAPI로 분리.

## MVP 로드맵

1. **구매 의사결정 에이전트** (첫 출시): 로그인 / 사용자 취향·예산 **기억** / 부족한 정보 **능동 질문** → 구매 조건 구조화 / 상품 API 조회·후보 비교 / 개인화 추천 + **이유 제시**
   - 차별점(북극성) = **기억 + 능동적 구조화 질문 + 실제 상품 데이터 비교.** 셋 중 하나라도 빠지면 ChatGPT 래퍼.
   - v1 스코프 = **구매 결정만**. 아키텍처는 범용 의사결정 엔진이지만 다른 도메인은 v1에 넣지 않는다(슈퍼앱 함정 방지).
2. **의사결정 도메인 확장**: 여행·자취·공부 등 — **데이터 접근이 확인되는 것부터**.
3. **수익화**: 현재는 **비상업**(광고·어필리에이트 없음)이라 네이버 오픈 API 사용 가능. 수익화 시점이 곧 상품 API를 **제휴형(쿠팡 파트너스 등)으로 교체**하는 트리거.

> 방향 전환 메모: 원래 "AI 캐릭터챗 → 추천 → 커머스"였으나, 캐릭터챗+커머스 결합의 부자연스러움 + 커머스 단독의 낮은 차별성 문제로 **"기억형 의사결정 에이전트(첫 도메인=구매)"** 로 피벗. 인프라(인증·LLM 라우터·메모리·모바일)는 그대로 재활용하고, 캐릭터 시스템은 조언자로 축소한다.

## 규칙

- 앱별 전용 설정(tsconfig, app.json, Expo 지침 등)은 각 앱 디렉터리에 둔다. 이 루트 문서는 **레포 전체** 규칙만 다룬다.
- `apps/native-companion/AGENTS.md` 에 Expo 전용 지침이 별도로 있으니 네이티브 작업 시 함께 참고.
- `apps/nest-companion/AGENTS.md` 에 백엔드(LLM 추상화·에러 처리·보안) 지침이 별도로 있으니 백엔드 작업 시 함께 참고.
