# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## 구조

```
src/
├─ app/                      # expo-router v56 (파일 = 라우트)
│  ├─ _layout.tsx            # 루트: SplashScreen + Auth→Character 3단 Stack.Protected 게이트
│  ├─ login.tsx              # 미인증 (로그인/회원가입 폼 토글)
│  ├─ onboarding.tsx         # 캐릭터 없을 때 (이름·말투·호칭 + 식성/알레르기/조리도구 태그 → 생성)
│  ├─ (tabs)/                # 홈 / 냉장고 / [FAB] / 채팅(대화 목록) / 프로필(허브)
│  ├─ settings/             # 프로필 하위 페이지: character(설정) · memory(AI가 기억하는 나) · account
│  ├─ inventory/add.tsx      # 재료 직접 추가 (FAB 메뉴에서 진입)
│  ├─ inventory/scan.tsx     # 영수증·사진 인식 → 확인·수정 후 저장
│  └─ conversation/[id].tsx  # 채팅 창 (id="new" 면 새 대화)
├─ components/               # 공통 UI (Screen/Button/Card/Avatar/Bubble/CenterFabMenu) — NativeWind
├─ lib/                      # 순수 헬퍼 (expiry.ts = 유통기한 표시·카피 / messages.ts = 대화 아이템 해석)
├─ api/                      # 백엔드 호출 (client.ts = apiFetch 래퍼)
└─ context/                  # 전역 상태 (auth, character, inventory)
```

## 방침

- 상태관리는 **React Context** (zustand 아님). `context/auth.tsx`(`AuthProvider`/`useAuth`), `context/character.tsx`(`CharacterProvider`/`useCharacter`), `context/inventory.tsx`(`InventoryProvider`/`useInventory`). **Provider 중첩: Auth > Character > Inventory** (인증 먼저 → 캐릭터·재고는 그 뒤). 각 Provider 는 `auth.status` 를 구독해 인증됐을 때만 로드하고, 로그아웃되면 리셋한다.
- **냉장고 재고는 전역 진실원천**이다(`useInventory`). 홈·냉장고·채팅이 같은 목록·같은 mutation 함수(add/update/consume/restore/remove)를 쓰므로, 한 화면의 변경이 곧바로 전 화면에 반영된다 — 예전엔 화면마다 따로 fetch·따로 state 라 냉장고에서 소비해도 홈은 포커스 전까지 어긋났다. 화면은 **focus 마다 새로고침하지 않고 구독만** 한다. `items` 는 항상 임박순 정렬, `expiring`(오늘까지·지남)은 파생값.
- **effect 본문에서 동기 `setState` 를 하지 않는다**(이 레포는 cascading-render 를 lint error 로 막는다). 대신 `void Promise.resolve().then(...)` 로 미루거나(Provider 초기 로드) **파생값을 렌더 중 계산**한다(예: 냉장고 필터가 무효가 되면 `activeFilter` 로 보정 — 상태를 되돌리지 않는다). 같은 이유로 **렌더 중 ref 접근도 금지**라, effect 에서 부를 콜백은 `useCallback` 으로 안정화한다.
- 화면 분기는 `_layout.tsx` 의 `Stack.Protected guard={...}` **3단**으로 한다: 미인증 → `login`, 인증+캐릭터 없음 → `onboarding`, 인증+캐릭터 → `(tabs)`(+하위 stack). 화면 안에서 `router.replace` 로 수동 리다이렉트하지 않는다.
- ⚠️ **`app/` 에 라우트 파일을 새로 만들면 항상 두 가지가 따라온다** — ① `_layout.tsx` 의 해당 가드 블록에 `Stack.Screen` 등록, ② typedRoutes 재생성(`expo start` 가 `.expo/types` 갱신). ①을 빠뜨리면 그 화면이 **어느 가드에도 안 묶여** 스택 순서가 꼬이고, 앱을 열자마자 엉뚱하게 그 화면이 뜬다(실제로 겪음).
- **탭은 4개 + 가운데 FAB**: 홈(`index` — 인사 + "먼저 먹어요" 임박 재료 + 히어로 카드 + 대화 시작 문구) / 냉장고(`fridge`) / 채팅(`chat` — 대화 목록) / 프로필(`profile` — 허브). 가운데 자리는 **더미 탭 `quickadd`** 가 잡고 있고(`tabBarButton` 이 빈 View 를 그림), 실제 버튼·스피드다이얼은 그 위에 겹치는 `CenterFabMenu` 오버레이가 그린다 — 그래야 위치가 정확히 맞는다. `quickadd` 라우트로는 이동하지 않는다. 새 탭·라우트 추가 시 typedRoutes 재생성 필요(`expo start` 가 `.expo/types` 갱신).
- **떠오르는 표면은 둘이고 역할이 다르다** — `Sheet`(바텀시트) = "무엇을 할지 고르는" 목록(아래에서 올라와 손가락 가까이 붙는다, 예: 추가 방법 선택). `Dialog`(가운데 모달) = **하던 것을 멈추고 한 건을 고칠 때**. 편집을 인라인으로 펼치면 원래 화면의 스크롤이 흔들리는데, 특히 채팅 스트림 한복판에선 카드가 부풀며 스크롤이 튄다. 둘 다 **폼을 담을 수 있어야 해서** `KeyboardAvoidingView`(시트·모달은 화면 아래·가운데라 키보드에 가려진다) + `ScrollView`(칩·날짜 피커까지 들어가면 화면을 넘긴다) + `keyboardShouldPersistTaps="handled"`(없으면 키보드가 떠 있을 때 첫 탭이 버튼에 안 닿아 "저장이 한 번에 안 눌린다")를 컴포넌트가 떠안는다.
  - **재료 편집은 `IngredientEditDialog` 한 곳**이다(`Dialog` + `IngredientForm`). 냉장고 탭이 쓰고, 채팅 확인 카드의 `add` 줄도 이걸 열 예정이다. ⚠️ 폼은 `initial` 을 useState **초기값으로만** 읽으므로 `visible` 로 감싸 **열 때마다 새로 마운트**한다 — 안 그러면 다른 재료를 열었을 때 이전 편집값이 남는다.
- **재료 입력 필드는 `IngredientForm` 한 벌뿐이고, 껍데기만 다르다** — 추가는 전체 화면 라우트(`inventory/add`), 수정은 모달(`IngredientEditDialog`), 스캔 확인은 인라인. 예전엔 `showExpiry` 로 유통기한 섹션을 추가 경로에서만 켰는데, 그러면 같은 "재료 한 건"인데 화면마다 고칠 수 있는 게 달라지고 필드를 하나 늘릴 때 두 곳을 고쳐야 했다. 지금은 **항상 노출**하고 수정 경로가 현재 값으로 시작한다.
  - **폼 → 서버 페이로드 변환도 이 파일이 소유**한다: `toPatch`(PATCH — 빈 수량은 "미변경") / `toAddInput`(POST — 빈 값은 아예 제외). 호출자가 각자 객체를 조립하면 규칙이 흩어진다.
  - `expiresAt` 은 **사용자가 "기본값" 체크를 끄고 직접 고른 경우에만** 실린다. 그래야 서버가 그때만 `USER` 로 승격하고, 나머지는 계속 추정한다.
  - ⚠️ **추정 기준일(`initial.addedAt`)을 넘겨야 한다.** 서버는 수정 시 **등록일** 기준으로 재추정하는데(`inventory.service.update`), 폼이 오늘 기준으로 보여주면 화면의 "기본값" 날짜와 실제 저장값이 어긋난다.
  - ⚠️ **모달은 화면이 하나만 들고 목록 아이템은 열어달라고 요청만 한다**(`onEdit`). 카드마다 두면 재료 수만큼 RN `Modal` 이 마운트된다.
- **냉장고 탭**(`fridge`): 재고 임박순 목록 + 신선도 배지 + 분류 필터 칩(전체/채소/…, 데이터에 있는 분류만 — `settings/memory` 와 같은 패턴) + `⋯` 메뉴(다 먹음/수정/삭제) + 직접 추가 폼. 수정은 `IngredientEditDialog`(목록 위로 뜬다), 추가는 `/inventory/add` 모달 라우트 — 둘 다 같은 `IngredientForm` 을 공유한다. 삭제(hard)는 되돌리기가 없어 `Alert`(웹에서 안 뜸) 대신 **인라인 2단계 확인**("삭제"→"정말 삭제")으로 막는다.
- **유통기한 카피·표시 로직은 `lib/expiry.ts` 한 곳**이 소유한다(냉장고 탭·홈이 공유). 톤은 "곧 상해요" 같은 위협조 대신 **"먼저 먹어요"**. 남은 일수는 서버 표기와 같은 자정 기준으로 계산한다. 문구를 바꾸려면 이 파일만 고친다.
- **재고 소비는 낙관적 + 되돌리기**: "다 먹음"은 `useInventory().consume`(목록에서 즉시 제거 + 서버 soft delete)이고, 화면은 하단에 `되돌리기` 배너를 띄운다(`restore` 한 번). LLM·오터치 오차감 복구용. "다 먹음"과 "삭제(hard)"는 의미가 달라(이력에 남길지) 경로가 갈린다.
- **영수증·사진 스캔도 확인을 거친다**(`inventory/scan.tsx`) — 서버는 **제안만** 주고, 사용자가 ⋯ 로 수정·제외한 뒤 저장한다. 채팅 확인 카드와 같은 방침이고, 수정은 다른 경로와 **같은 `IngredientForm`** 을 인라인으로 연다(여기만 모달이 아니다 — 이미 전용 확인 화면이라 목록 위에 또 띄울 이유가 없다).
  - 큰 글씨는 **이번에 산 양**(`merge.added`), 작은 글씨가 `기존 4개 · 추가 후 14개`. 확인 화면의 목적이 "영수증에서 제대로 읽었나" 검증이라 구매량이 주인공이고, **실제 저장되는 값은 `quantityNote`(합계)** 다.
  - 수량을 직접 고치면 `merge` 를 **함께 지운다** — 안 그러면 "기존 4개 · 추가 후 14개"가 고친 숫자를 설명하지 못해 거짓말이 된다.
  - 리사이즈 값은 `lib/scan.ts` 의 `PRESETS` 가 소유한다. **영수증과 사진이 다르다** — 영수증은 작은 글자를 읽어야 해서 넉넉히(1600px), 사진은 사물만 알아보면 되므로 더 줄인다. 이 숫자가 **정확도와 토큰 비용의 조절 손잡이**다.
  - ⚠️ **업로드는 `expo-file-system` 의 `File`(Blob 구현)로 보낸다.** 예전 RN 은 FormData 에 `{uri, name, type}` 객체를 받아줬지만 **RN 0.85 의 fetch 가 표준(WinterCG) 구현으로 바뀌며 거부**한다(`Unsupported FormDataPart implementation`). `import { File } from 'expo-file-system'` 을 빠뜨리면 전역 DOM `File` 이 잡혀 인자 개수 에러가 난다.
  - ⚠️ `apiFetch` 는 **FormData 면 `Content-Type` 을 붙이지 않는다** — multipart 는 boundary 가 헤더에 들어가야 하고 그건 fetch 가 만든다.
  - 촬영·갤러리는 `expo-image-picker`(카메라 화면을 직접 그리는 `expo-camera` 가 아니다 — 그건 바코드용). **갤러리 선택이 필수**다: 영수증은 이미 찍어둔 걸 고르는 경우가 많다. iOS 는 `app.json` 의 권한 문구가 없으면 실기기에서 죽는다.
- **채팅이 재고를 바꾸되, 반드시 사용자 확인을 거친다.** 서버가 툴 호출을 확인 카드(`InventoryConfirmCard`)로 올리고, 사용자가 편집·확인해야 실제로 반영된다(자동 차감 없음 — 백엔드 AGENTS.md "냉장고 툴" 참고). 확인 직후 `refresh()` 로 냉장고·홈에 즉시 반영하고, 그 외엔 채팅을 **나갈 때 한 번** 갱신한다(언마운트 effect + `dirtyRef`).
- **대화는 말풍선만이 아니다.** `MessageType` 이 `type` 기준 판별 유니온(`TEXT`/`FUNCTION_CALL`/`FUNCTION_CALL_OUTPUT`)이라 렌더가 분기한다. **어느 아이템에 카드를 그리는지는 툴마다 다르다** — 실행 주체가 다르기 때문이다:

  | 툴                 | 카드를 그리는 아이템   | 왜                                                                                       |
  | ------------------ | ---------------------- | ---------------------------------------------------------------------------------------- |
  | `update_inventory` | `FUNCTION_CALL`        | 호출이 곧 **확인 대기 중인 제안**이다. 결과는 그 카드의 상태(반영/취소 칩)로만 드러난다  |
  | `search_recipes`   | `FUNCTION_CALL_OUTPUT` | 서버가 이미 실행했고 **결과가 곧 내용**이다. 호출 아이템은 화면에 아무것도 만들지 않는다 |
  - `TEXT` → 말풍선. 제안의 처리 여부는 상태 필드가 아니라 **같은 `callId` 의 결과 아이템이 있는지**로 정한다(`outcomesByCallId`). 서버와 같은 규칙이다.
  - **앱이 모르는 툴은 조용히 건너뛴다**(`toInventoryProposal`/`toRecipeResult` 가 `null` 반환) — 백엔드에 툴이 추가돼도 구버전 앱이 안 깨지게 하는 장치다. 실제로 서버에 `search_recipes` 를 먼저 올렸을 때 앱은 그 턴을 조용히 비워 두었다(안 깨졌다).
  - 툴 봉투를 화면용으로 좁히는 캐스팅은 **`lib/messages.ts` 한 곳**에만 둔다.

- **레시피 결과는 카드 여러 장이 아니라 블록 하나**(`RecipeResultCard`)다. 채팅은 스크롤 스트림이라 5장을 각각 카드로 띄우면 화면을 통째로 잡아먹고, 무엇보다 헤더(`🔍 ○○ 레시피 N개를 찾았어요`)가 **모델이 말을 안 한 턴을 비지 않게** 채운다 — 서버가 툴만 부르고 텍스트를 안 내는 경우가 실측으로 관측됐고, 그때 헤더가 없으면 사용자에겐 "보냈는데 반응 없음"으로 보인다. 0건·검색실패도 같은 블록이 문구만 바꿔 처리한다(칩 + 카드로 쪼개면 "검색했어요" 다음에 실패 블록이 오는 어색한 조합이 생긴다).
  - 각 줄은 **외부 브라우저로 나간다**(`Linking.openURL`, 웹뷰 아님). v1.1 이 검증하려는 건 "검색으로 붙인 상세 레시피가 쓸모 있나"이고 웹뷰냐 링크냐는 그 답을 바꾸지 않는다. 네이버 블로그·레시피 사이트는 자체 리다이렉트가 있어 임베디드 웹뷰에서 깨지기 쉽다 — 이탈이 실제로 관측되면 그때 승격한다.
  - **출처 도메인을 항상 노출한다.** 우리가 검증한 레시피가 아니라 외부 글이라는 표시다.
- 메시지 전송·확인·취소 응답은 전부 `{ messages: [...] }`(이번에 새로 생긴 아이템들)라 화면은 **뒤에 이어붙이기만** 한다. 한 턴에 말풍선과 카드가 함께 올 수 있다.
- 스타일은 **NativeWind**(`className`) + **클린 중립 디자인 토큰**(`tailwind.config.js` theme.extend): 배경 `cream`(=연한 쿨그레이 캔버스 `#F7F8FC`, 토큰명 유지) · 들어간/독립 회색면 `sand`(입력·회색 말풍선·비선택 칩) · 보더/구분선 `line` · 텍스트 `ink`(쿨 뉴트럴) · 포인트 `lavender` · 보조 `peach`/`blush` · 카테고리 틴트 `mint`/`sky`/`amber`. 배경 기본 `bg-cream`, 상태바는 `style="dark"`. **3단 엘리베이션**(틴트 캔버스 < 흰 카드): 카드는 `Card` 가 `bg-white`+`border-line` 로 캔버스 위에서 떠 보이게 하고, `sand` 는 캔버스보다 살짝 진해 그 위 독립 회색면(말풍선 등)이 묻히지 않는다. **색을 하드코딩하지 말고 토큰**을 쓰고, 반복 UI는 `src/components/` 공통 컴포넌트(`Screen`/`Button`/`Card`/`Avatar`/`Bubble`)로 뽑는다 — 디자인 변경은 토큰·컴포넌트 한 곳만 고치면 전 화면 반영.
- 프로필 탭은 **허브**다: 상단 내 정보 + 섹션 행(캐릭터 설정 → `settings/character`, AI 메모리 관리 → `settings/memory`). 하위 페이지는 캐릭터 가드 블록의 `Stack.Screen`(파스텔 테마 네이티브 헤더 = 뒤로가기 자동). 새 라우트 추가 시 typedRoutes 재생성 필요(`expo start` 가 `.expo/types` 갱신).
- 모든 백엔드 호출은 `api/client.ts` 의 `apiFetch` 를 거친다. 저장된 **access token**(`Authorization: Bearer`)을 자동 첨부하고, 401(만료)이면 **refresh 로 새 access 를 받아 1회 자동 재시도**한다. 실패 응답은 status 를 담은 `ApiError` 로 throw 한다. 토큰은 `api/token.ts` 가 **access/refresh 를 한 JSON 객체**로 SecureStore(웹은 localStorage — 웹은 배포 대상 아님)에 보관하고, 인증 상태·로그인/회원가입/로그아웃은 `context/auth.tsx` 가 관리한다 (백엔드 AGENTS.md "인증" 참고).
- **토큰 폐기의 소유권은 `client.ts` 한 곳**이다: refresh 가 **확정 실패(400/401/403)면** 토큰을 비우고 `auth-events` 로 인증만료를 쏜다(→ `auth.tsx` 가 상태만 반영). **일시 오류(5xx/429/네트워크)면 토큰을 유지**하고 에러를 던져 재시도 가능하게 둔다. `auth.tsx`(bootstrap 포함)는 토큰을 **직접 지우지 않는다** — 일시적 서버 오류에 강제 로그아웃되는 것을 막는 불변식.
- **신뢰 경계**: instruction/model/대화 히스토리를 클라이언트가 만들지 않는다. 메시지 `content` 만 보내고 서버가 나머지를 해석한다.
- 새 대화는 **지연 생성**: "새 채팅"은 `/conversation/new` 빈 화면만 열고, 첫 메시지에서 `POST /conversations` 로 실제 대화가 생긴다.
