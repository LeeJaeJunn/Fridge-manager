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

- 패키지 매니저: **pnpm** (`node-linker` 관련은 Expo 호환 위해 주의)
- 포매팅: 루트 `prettier` + `prettier-plugin-tailwindcss` (루트에서 `pnpm format`)
- 에디터 설정: 루트 `.vscode/` (워크스페이스 전체 공통)

## 백엔드 방침

- 단일 백엔드 **NestJS(TS)** 로 간다. 처음부터 서버를 둘로 쪼개지 않는다.
- **데이터 스택은 검토 중 (미확정).** 후보:
  - **DynamoDB 단독** — 가장 단순하게 시작, 벡터는 실제 필요 시 도입. AWS 생태계.
  - **Postgres + pgvector** — DB 하나로 기본 데이터 + 벡터 검색을 모두 처리. 관리형(Neon/Supabase) 가능.
  - (DynamoDB + ChromaDB 조합은 2시스템 운영·동기화 부담이 커서 현 단계엔 보류.)
  - 참고: **MVP1은 장기 메모리 ~5개 수준이라 벡터 유사도 검색 자체가 아직 불필요** (메모리 전부를 프롬프트에 주입하면 됨). 따라서 당장은 "기본 DB 선택"만 정하면 된다.
- 임베딩/LLM은 API 호출(TS SDK)로 처리.
- 로컬 ML 모델·커스텀 스코어링이 실제로 필요해지는 시점에만 해당 기능을 FastAPI로 분리.

## MVP 로드맵

1. **AI 컴패니언 채팅**: 로그인 / 캐릭터 선택 / 채팅 / 대화 저장 / 장기 메모리 추출
2. **개인화 추천**: 취향 저장 / 대화 기반 카테고리 추천 / 상품 카드 UI / 추천 이유 (더미 상품 DB)
3. **실제 커머스 연결**: 쿠팡 파트너스 / 네이버 쇼핑 / 아마존 PA API

## 규칙

- 앱별 전용 설정(tsconfig, app.json, Expo 지침 등)은 각 앱 디렉터리에 둔다. 이 루트 문서는 **레포 전체** 규칙만 다룬다.
- `apps/native-companion/AGENTS.md` 에 Expo 전용 지침이 별도로 있으니 네이티브 작업 시 함께 참고.
- `apps/nest-companion/AGENTS.md` 에 백엔드(LLM 추상화·에러 처리·보안) 지침이 별도로 있으니 백엔드 작업 시 함께 참고.
