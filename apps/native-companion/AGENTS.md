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
└─ context/                  # 전역 상태 (auth, character)
```

## 방침

- 상태관리는 **React Context** (zustand 아님). `context/auth.tsx`(`AuthProvider`/`useAuth`), `context/character.tsx`(`CharacterProvider`/`useCharacter`). **Provider 중첩: AuthProvider > CharacterProvider** (인증 먼저 → 캐릭터). 캐릭터는 로그인 이후에만 의미가 있다.
- 화면 분기는 `_layout.tsx` 의 `Stack.Protected guard={...}` **3단**으로 한다: 미인증 → `login`, 인증+캐릭터 없음 → `onboarding`, 인증+캐릭터 → `(tabs)`(+하위 stack). 화면 안에서 `router.replace` 로 수동 리다이렉트하지 않는다.
- **탭은 4개**: 홈(`index` — 인사 + "먼저 먹어요" 임박 재료 + 히어로 카드 + 대화 시작 문구) / 냉장고(`fridge` — 재고 임박순 목록·신선도 배지·소비/되돌리기·직접 추가) / 채팅(`chat` — 대화 목록) / 프로필(`profile` — 허브). 새 탭·라우트 추가 시 typedRoutes 재생성 필요(`expo start` 가 `.expo/types` 갱신).
- **유통기한 카피·표시 로직은 `lib/expiry.ts` 한 곳**이 소유한다(냉장고 탭·홈이 공유). 톤은 "곧 상해요" 같은 위협조 대신 **"먼저 먹어요"**. 남은 일수는 서버 표기와 같은 자정 기준으로 계산하고, 추정 만료일은 "쯤"으로 흐린다. 문구를 바꾸려면 이 파일만 고친다.
- **재고 소비는 낙관적 + 되돌리기**: "다 먹음"을 누르면 목록에서 먼저 지우고 서버에 반영하며, 하단에 `되돌리기` 배너를 띄운다(soft delete 라 `restore` 한 번). LLM·오터치 오차감 복구용.
- 스타일은 **NativeWind**(`className`) + **클린 중립 디자인 토큰**(`tailwind.config.js` theme.extend): 배경 `cream`(=흰색, 토큰명 유지) · 들어간 표면 `sand`(쿨 그레이: 입력·회색 말풍선·비선택 칩) · 보더/구분선 `line` · 텍스트 `ink`(쿨 뉴트럴) · 포인트 `lavender` · 보조 `peach`/`blush` · 카테고리 틴트 `mint`/`sky`/`amber`. 배경 기본 `bg-cream`, 상태바는 `style="dark"`. **흰 배경이라 카드는 `Card` 가 기본 `border-line` 로 표면을 구분**한다(흰 위 흰 카드 방지). **색을 하드코딩하지 말고 토큰**을 쓰고, 반복 UI는 `src/components/` 공통 컴포넌트(`Screen`/`Button`/`Card`/`Avatar`/`Bubble`)로 뽑는다 — 디자인 변경은 토큰·컴포넌트 한 곳만 고치면 전 화면 반영.
- 프로필 탭은 **허브**다: 상단 내 정보 + 섹션 행(캐릭터 설정 → `settings/character`, AI 메모리 관리 → `settings/memory`). 하위 페이지는 캐릭터 가드 블록의 `Stack.Screen`(파스텔 테마 네이티브 헤더 = 뒤로가기 자동). 새 라우트 추가 시 typedRoutes 재생성 필요(`expo start` 가 `.expo/types` 갱신).
- 모든 백엔드 호출은 `api/client.ts` 의 `apiFetch` 를 거친다. 저장된 **access token**(`Authorization: Bearer`)을 자동 첨부하고, 401(만료)이면 **refresh 로 새 access 를 받아 1회 자동 재시도**한다. 실패 응답은 status 를 담은 `ApiError` 로 throw 한다. 토큰은 `api/token.ts` 가 **access/refresh 를 한 JSON 객체**로 SecureStore(웹은 localStorage — 웹은 배포 대상 아님)에 보관하고, 인증 상태·로그인/회원가입/로그아웃은 `context/auth.tsx` 가 관리한다 (백엔드 AGENTS.md "인증" 참고).
- **토큰 폐기의 소유권은 `client.ts` 한 곳**이다: refresh 가 **확정 실패(400/401/403)면** 토큰을 비우고 `auth-events` 로 인증만료를 쏜다(→ `auth.tsx` 가 상태만 반영). **일시 오류(5xx/429/네트워크)면 토큰을 유지**하고 에러를 던져 재시도 가능하게 둔다. `auth.tsx`(bootstrap 포함)는 토큰을 **직접 지우지 않는다** — 일시적 서버 오류에 강제 로그아웃되는 것을 막는 불변식.
- **신뢰 경계**: instruction/model/대화 히스토리를 클라이언트가 만들지 않는다. 메시지 `content` 만 보내고 서버가 나머지를 해석한다.
- 새 대화는 **지연 생성**: "새 채팅"은 `/conversation/new` 빈 화면만 열고, 첫 메시지에서 `POST /conversations` 로 실제 대화가 생긴다.
