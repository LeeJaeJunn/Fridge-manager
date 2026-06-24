# Companion — AI 컴패니언 커머스 에이전트

"나를 기억하는 AI 친구" → 상황 기반 추천 → 커머스 연결로 발전하는 모바일 앱.

## 모노레포 구조 (pnpm workspace)

```
companion/
├─ apps/
│  ├─ native-companion/   # 모바일 앱 (React Native + Expo + TS)
│  └─ nest-companion/     # 메인 백엔드 (NestJS + TS)
├─ packages/              # 앱 간 공유 패키지 (타입/유틸 등) — 예정
└─ (root)                 # 워크스페이스 오케스트레이터: prettier, vscode, ci
```

- 패키지 매니저: **pnpm**. Expo/Metro 호환을 위해 **`pnpm-workspace.yaml` 에 `nodeLinker: hoisted`** 필수 (없으면 `react-native-css-interop` 등 transitive 의존성을 Metro 가 못 찾음). pnpm 11 은 이 설정을 `.npmrc` 가 아니라 `pnpm-workspace.yaml` 에서 읽는다.
- 포매팅: 루트 `prettier` + `prettier-plugin-tailwindcss` (루트에서 `pnpm format`)
- 에디터 설정: 루트 `.vscode/` (워크스페이스 전체 공통)

## 백엔드 방침

- 단일 백엔드 **NestJS(TS)** 로 간다. 처음부터 서버를 둘로 쪼개지 않는다.
- **데이터 스택: Postgres + Prisma (확정).**
  - 로컬 개발은 Docker(`apps/nest-companion/docker-compose.yml`, `pgvector/pgvector` 이미지)로 띄운다. 프로덕션은 관리형(Neon/RDS 등)으로 가고, 앱은 `DATABASE_URL` 만 바꾸면 된다.
  - ORM은 **Prisma**. 스키마·마이그레이션·연결 세부와 주의사항은 `apps/nest-companion/AGENTS.md` 참고.
  - 벡터: pgvector 이미지를 쓰지만 **MVP1은 장기 메모리 ~5개라 벡터 유사도 검색이 아직 불필요** (메모리 전부를 프롬프트에 주입). 실제 필요해지면 `vector` 컬럼만 추가한다.
- 임베딩/LLM은 API 호출(TS SDK)로 처리.
- 로컬 ML 모델·커스텀 스코어링이 실제로 필요해지는 시점에만 해당 기능을 FastAPI로 분리.

## MVP 로드맵

1. **AI 컴패니언 채팅**: 로그인 / 내 캐릭터 설정(이름·페르소나) / 채팅 / 대화 저장 / 장기 메모리 추출
   - 유저당 캐릭터는 **하나**다(여러 개 중 선택이 아님). 자세한 건 백엔드 AGENTS.md의 "캐릭터 데이터" 참고.
2. **개인화 추천**: 취향 저장 / 대화 기반 카테고리 추천 / 상품 카드 UI / 추천 이유 (더미 상품 DB)
3. **실제 커머스 연결**: 쿠팡 파트너스 / 네이버 쇼핑 / 아마존 PA API

## 규칙

- 앱별 전용 설정(tsconfig, app.json, Expo 지침 등)은 각 앱 디렉터리에 둔다. 이 루트 문서는 **레포 전체** 규칙만 다룬다.
- `apps/native-companion/AGENTS.md` 에 Expo 전용 지침이 별도로 있으니 네이티브 작업 시 함께 참고.
- `apps/nest-companion/AGENTS.md` 에 백엔드(LLM 추상화·에러 처리·보안) 지침이 별도로 있으니 백엔드 작업 시 함께 참고.
