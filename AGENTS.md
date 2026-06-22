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
- 벡터 검색은 **Postgres + pgvector**, 임베딩/LLM은 API 호출(TS SDK)로 처리.
- 로컬 ML 모델·커스텀 스코어링이 실제로 필요해지는 시점에만 해당 기능을 FastAPI로 분리.

## MVP 로드맵

1. **AI 컴패니언 채팅**: 로그인 / 캐릭터 선택 / 채팅 / 대화 저장 / 장기 메모리 추출
2. **개인화 추천**: 취향 저장 / 대화 기반 카테고리 추천 / 상품 카드 UI / 추천 이유 (더미 상품 DB)
3. **실제 커머스 연결**: 쿠팡 파트너스 / 네이버 쇼핑 / 아마존 PA API

## 규칙

- 앱별 전용 설정(tsconfig, app.json, Expo 지침 등)은 각 앱 디렉터리에 둔다. 이 루트 문서는 **레포 전체** 규칙만 다룬다.
- `apps/native-companion/AGENTS.md` 에 Expo 전용 지침이 별도로 있으니 네이티브 작업 시 함께 참고.
