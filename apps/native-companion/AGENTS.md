# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## 구조

```
src/
├─ app/                      # expo-router v56 (파일 = 라우트)
│  ├─ _layout.tsx            # 루트: SplashScreen 제어 + Stack.Protected 게이트
│  ├─ onboarding.tsx         # 캐릭터 없을 때 (프리셋 선택 → 생성)
│  ├─ (tabs)/                # 홈 / 채팅(대화 목록) / 프로필
│  └─ conversation/[id].tsx  # 채팅 창 (id="new" 면 새 대화)
├─ api/                      # 백엔드 호출 (client.ts = apiFetch 래퍼)
└─ context/                  # 전역 상태 (React Context)
```

## 방침

- 상태관리는 **React Context** (zustand 아님). 예: `context/character.tsx` 의 `CharacterProvider`/`useCharacter`.
- 화면 분기는 `_layout.tsx` 의 `Stack.Protected guard={...}` 로 한다 (캐릭터 유무 → 온보딩 vs 탭). 화면 안에서 `router.replace` 로 수동 리다이렉트하지 않는다.
- 스타일은 **NativeWind**(`className`). 배경 기본 흰색(`bg-white`), 상태바는 `style="dark"`.
- 모든 백엔드 호출은 `api/client.ts` 의 `apiFetch` 를 거친다. dev 동안 `x-user-id` 헤더(= `ENV.devUserId`)로 dev-auth 시드 유저를 식별한다 (백엔드 AGENTS.md "dev-auth" 참고).
- **신뢰 경계**: instruction/model/대화 히스토리를 클라이언트가 만들지 않는다. 메시지 `content` 만 보내고 서버가 나머지를 해석한다.
- 새 대화는 **지연 생성**: "새 채팅"은 `/conversation/new` 빈 화면만 열고, 첫 메시지에서 `POST /conversations` 로 실제 대화가 생긴다.
