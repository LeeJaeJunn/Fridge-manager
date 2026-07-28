# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## 구조

```
src/
├─ app/                      # expo-router v56 (파일 = 라우트)
│  ├─ _layout.tsx            # 루트: SplashScreen + Auth→Character 3단 Stack.Protected 게이트
│  ├─ login.tsx              # 미인증 (로그인/회원가입 폼 토글)
│  ├─ onboarding.tsx         # 캐릭터 없을 때 (이름·말투·호칭 + 식성/알레르기/조리도구 태그 → 생성)
│  ├─ (tabs)/                # 홈 / 냉장고 / 채팅(대화 목록) / 프로필(허브)
│  ├─ settings/             # 프로필 하위 페이지: character(설정) · memory(AI가 기억하는 나)
│  └─ conversation/[id].tsx  # 채팅 창 (id="new" 면 새 대화)
├─ components/               # 공통 UI (Screen/Button/Card/Avatar/Bubble/ProductCard) — NativeWind
├─ lib/                      # 순수 헬퍼 (expiry.ts = 유통기한 표시·카피, 냉장고+홈 공유)
├─ api/                      # 백엔드 호출 (client.ts = apiFetch 래퍼)
└─ context/                  # 전역 상태 (auth, character, inventory)
```

## 방침

- 상태관리는 **React Context** (zustand 아님). `context/auth.tsx`(`AuthProvider`/`useAuth`), `context/character.tsx`(`CharacterProvider`/`useCharacter`), `context/inventory.tsx`(`InventoryProvider`/`useInventory`). **Provider 중첩: Auth > Character > Inventory** (인증 먼저 → 캐릭터·재고는 그 뒤). 각 Provider 는 `auth.status` 를 구독해 인증됐을 때만 로드하고, 로그아웃되면 리셋한다.
- **냉장고 재고는 전역 진실원천**이다(`useInventory`). 홈·냉장고·채팅이 같은 목록·같은 mutation 함수(add/update/consume/restore/remove)를 쓰므로, 한 화면의 변경이 곧바로 전 화면에 반영된다 — 예전엔 화면마다 따로 fetch·따로 state 라 냉장고에서 소비해도 홈은 포커스 전까지 어긋났다. 화면은 **focus 마다 새로고침하지 않고 구독만** 한다. `items` 는 항상 임박순 정렬, `expiring`(오늘까지·지남)은 파생값.
- **effect 본문에서 동기 `setState` 를 하지 않는다**(이 레포는 cascading-render 를 lint error 로 막는다). 대신 `void Promise.resolve().then(...)` 로 미루거나(Provider 초기 로드) **파생값을 렌더 중 계산**한다(예: 냉장고 필터가 무효가 되면 `activeFilter` 로 보정 — 상태를 되돌리지 않는다). 같은 이유로 **렌더 중 ref 접근도 금지**라, effect 에서 부를 콜백은 `useCallback` 으로 안정화한다.
- 화면 분기는 `_layout.tsx` 의 `Stack.Protected guard={...}` **3단**으로 한다: 미인증 → `login`, 인증+캐릭터 없음 → `onboarding`, 인증+캐릭터 → `(tabs)`(+하위 stack). 화면 안에서 `router.replace` 로 수동 리다이렉트하지 않는다.
- **탭은 4개**: 홈(`index` — 인사 + "먼저 먹어요" 임박 재료 + 히어로 카드 + 대화 시작 문구) / 냉장고(`fridge`) / 채팅(`chat` — 대화 목록) / 프로필(`profile` — 허브). 새 탭·라우트 추가 시 typedRoutes 재생성 필요(`expo start` 가 `.expo/types` 갱신).
- **냉장고 탭**(`fridge`): 재고 임박순 목록 + 신선도 배지 + 분류 필터 칩(전체/채소/…, 데이터에 있는 분류만 — `settings/memory` 와 같은 패턴) + `⋯` 메뉴(다 먹음/수정/삭제) + 직접 추가 폼. 추가·수정은 같은 `IngredientForm` 을 공유한다. 삭제(hard)는 되돌리기가 없어 `Alert`(웹에서 안 뜸) 대신 **인라인 2단계 확인**("삭제"→"정말 삭제")으로 막는다. 유통기한 직접 편집은 v1 에 없다(보관을 바꾸면 서버가 재추정).
- **유통기한 카피·표시 로직은 `lib/expiry.ts` 한 곳**이 소유한다(냉장고 탭·홈이 공유). 톤은 "곧 상해요" 같은 위협조 대신 **"먼저 먹어요"**. 남은 일수는 서버 표기와 같은 자정 기준으로 계산한다. 문구를 바꾸려면 이 파일만 고친다.
- **재고 소비는 낙관적 + 되돌리기**: "다 먹음"은 `useInventory().consume`(목록에서 즉시 제거 + 서버 soft delete)이고, 화면은 하단에 `되돌리기` 배너를 띄운다(`restore` 한 번). LLM·오터치 오차감 복구용. "다 먹음"과 "삭제(hard)"는 의미가 달라(이력에 남길지) 경로가 갈린다.
- **채팅이 재고를 바꾼다**(서버 tool-use `add_ingredients`/`consume_ingredients`). 화면은 채팅을 **나갈 때 한 번** `refresh()` 한다(언마운트 effect, 메시지를 실제로 보냈을 때만 — `dirtyRef`). 채팅 중엔 냉장고·홈이 안 보여 매 메시지 갱신은 불필요하다. 이게 재고를 서버가 바꾸는 유일한 경로라, 다른 화면은 `refresh` 를 부를 일이 없다.
- 스타일은 **NativeWind**(`className`) + **클린 중립 디자인 토큰**(`tailwind.config.js` theme.extend): 배경 `cream`(=연한 쿨그레이 캔버스 `#F7F8FC`, 토큰명 유지) · 들어간/독립 회색면 `sand`(입력·회색 말풍선·비선택 칩) · 보더/구분선 `line` · 텍스트 `ink`(쿨 뉴트럴) · 포인트 `lavender` · 보조 `peach`/`blush` · 카테고리 틴트 `mint`/`sky`/`amber`. 배경 기본 `bg-cream`, 상태바는 `style="dark"`. **3단 엘리베이션**(틴트 캔버스 < 흰 카드): 카드는 `Card` 가 `bg-white`+`border-line` 로 캔버스 위에서 떠 보이게 하고, `sand` 는 캔버스보다 살짝 진해 그 위 독립 회색면(말풍선 등)이 묻히지 않는다. **색을 하드코딩하지 말고 토큰**을 쓰고, 반복 UI는 `src/components/` 공통 컴포넌트(`Screen`/`Button`/`Card`/`Avatar`/`Bubble`)로 뽑는다 — 디자인 변경은 토큰·컴포넌트 한 곳만 고치면 전 화면 반영.
- 프로필 탭은 **허브**다: 상단 내 정보 + 섹션 행(캐릭터 설정 → `settings/character`, AI 메모리 관리 → `settings/memory`). 하위 페이지는 캐릭터 가드 블록의 `Stack.Screen`(파스텔 테마 네이티브 헤더 = 뒤로가기 자동). 새 라우트 추가 시 typedRoutes 재생성 필요(`expo start` 가 `.expo/types` 갱신).
- 모든 백엔드 호출은 `api/client.ts` 의 `apiFetch` 를 거친다. 저장된 **access token**(`Authorization: Bearer`)을 자동 첨부하고, 401(만료)이면 **refresh 로 새 access 를 받아 1회 자동 재시도**한다. 실패 응답은 status 를 담은 `ApiError` 로 throw 한다. 토큰은 `api/token.ts` 가 **access/refresh 를 한 JSON 객체**로 SecureStore(웹은 localStorage — 웹은 배포 대상 아님)에 보관하고, 인증 상태·로그인/회원가입/로그아웃은 `context/auth.tsx` 가 관리한다 (백엔드 AGENTS.md "인증" 참고).
- **토큰 폐기의 소유권은 `client.ts` 한 곳**이다: refresh 가 **확정 실패(400/401/403)면** 토큰을 비우고 `auth-events` 로 인증만료를 쏜다(→ `auth.tsx` 가 상태만 반영). **일시 오류(5xx/429/네트워크)면 토큰을 유지**하고 에러를 던져 재시도 가능하게 둔다. `auth.tsx`(bootstrap 포함)는 토큰을 **직접 지우지 않는다** — 일시적 서버 오류에 강제 로그아웃되는 것을 막는 불변식.
- **신뢰 경계**: instruction/model/대화 히스토리를 클라이언트가 만들지 않는다. 메시지 `content` 만 보내고 서버가 나머지를 해석한다.
- 새 대화는 **지연 생성**: "새 채팅"은 `/conversation/new` 빈 화면만 열고, 첫 메시지에서 `POST /conversations` 로 실제 대화가 생긴다.
