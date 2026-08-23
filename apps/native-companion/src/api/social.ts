import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { apiFetch } from '@/api/client';
import { setTokens } from '@/api/token';
import { ENV } from '@/config/env';
import type { AuthResponseType, CurrentUserType } from '@companion/types';

/** 사용자가 동의 화면을 닫았을 때. 에러 문구를 띄우지 않으려고 따로 구분한다. */
export class SocialCancelledError extends Error {
  constructor() {
    super('로그인을 취소했어요.');
    this.name = 'SocialCancelledError';
  }
}

/**
 * 카카오 인가 코드 받아오기 — **이 함수 하나만 환경을 탄다.**
 *
 * 지금은 브라우저 왕복이다(Expo Go 에는 카카오 네이티브 SDK 를 넣을 수 없다). dev build 로
 * 넘어가면 여기만 `KakaoLogin.login()` 으로 갈아끼우면 되고, **서버와 아래 `socialLogin` 은
 * 그대로다** — 그래서 교체 비용이 이 파일 한 곳에 갇혀 있다.
 *
 * 흐름: 앱이 우리 서버의 `/authorize` 를 열면 → 서버가 카카오로 302 → 동의 → 카카오가 서버
 * `/callback` 으로 302 → 서버가 다시 앱 스킴으로 302 → 브라우저가 닫히며 여기로 돌아온다.
 *
 * ⚠️ **카카오 URL 을 앱이 직접 만들지 않는다.** REST API 키와 `redirect_uri` 를 서버만 알고
 * 있어야 인증 때와 토큰 교환 때 값이 어긋날 수 없다(다르면 카카오가 KOE006 으로 거절한다).
 */
export async function getKakaoCode(): Promise<string> {
  // 앱 자신의 딥링크 주소. 플랫폼마다 다르다:
  //   Expo Go   exp://<host>:8081/--/login
  //   빌드된 앱  nativecompanion://login
  // ⚠️ **서버 `.env` 의 `APP_REDIRECT_URL` 과 정확히 같아야 한다.** 한 글자만 달라도 서버가
  //    보낸 주소를 이 세션이 못 알아보고, 브라우저 창이 안 닫힌 채로 멈춘다.
  //
  // ⚠️ **경로가 `login` 인 게 핵심이다** — 딥링크는 아래 리스너에만 오는 게 아니라 **expo-router
  // 에도 간다.** 없는 경로(`auth/kakao` 등)를 쓰면 라우터가 "Unmatched Route" 화면을 띄운다
  // (실제로 겪었다). 지금 보고 있는 화면을 가리키면 라우터 입장에선 제자리라 아무 일도 안 난다.
  //
  // 전용 라우트를 새로 만드는 방법도 있지만 그쪽이 더 나쁘다: 로그인이 실패했을 때(미인증 이메일 등)
  // 빠져나올 길 없는 화면에 갇히고, 그 화면이 code 를 직접 처리하게 하면 아래 리스너와 **같은
  // 1회용 code 를 두 번 쓰려고 경쟁**한다.
  const returnUrl = Linking.createURL('login');
  if (__DEV__) {
    // 이 값은 Expo Go 가 Metro 에 어떻게 붙었느냐에 따라 달라져서 추측으로는 못 맞춘다.
    // 서버 .env 에 넣을 값을 여기서 확인한다.
    console.log('[kakao] 서버 .env 의 APP_REDIRECT_URL 에 넣을 값:', returnUrl);
  }

  // ⚠️ **딥링크를 두 경로로 동시에 기다린다.**
  //
  // 카카오 세션이 살아 있으면 동의 화면 없이 **즉시** 되돌아오는데, 그러면 커스텀 탭이 다 열리기도
  // 전에 딥링크가 도착해 `openAuthSessionAsync` 가 그걸 놓치고 promise 가 영영 안 끝난다
  // (앱은 스피너만 돌고 멈춘다 — 실제로 겪었다. 처음 한 번은 동의 화면 때문에 느려서 됐다).
  // 그래서 `Linking` 이벤트도 함께 듣고 **먼저 오는 쪽**을 쓴다.
  let deliver: (url: string | null) => void = () => {};
  const fromDeepLink = new Promise<string | null>((resolve) => {
    deliver = resolve;
  });
  const sub = Linking.addEventListener('url', (e) => deliver(e.url));

  let url: string | null;
  try {
    const fromBrowser = WebBrowser.openAuthSessionAsync(
      `${ENV.apiUrl}/auth/social/kakao/authorize`,
      returnUrl,
    )
      // 'cancel'(사용자가 닫음) / 'dismiss'(앱이 닫음) — 둘 다 실패가 아니라 취소다.
      .then((r) => (r.type === 'success' ? r.url : null))
      // 진 쪽의 실패로 unhandled rejection 이 나지 않게 흡수한다(이긴 쪽이 이미 답을 줬다).
      .catch(() => null);

    url = await Promise.race([fromDeepLink, fromBrowser]);
  } finally {
    sub.remove();
    // 딥링크가 먼저 도착한 경우 브라우저가 뒤에 남아 있다 — 다음 로그인 때 방해되므로 닫는다.
    //
    // ⚠️ **실패를 통째로 삼킨다.** 타입은 `Promise<void>` 인데 안드로이드 구현은 아무것도 안
    // 돌려줘서(`undefined`) `.catch` 를 바로 붙이면 터진다 — 실제로 겪었다. 게다가 여긴
    // `finally` 라 여기서 던지면 **이미 받아둔 code 까지 예외로 바뀐다**(그게 실제 증상이었다).
    // 창을 닫는 건 뒷정리일 뿐이라 성공 여부가 로그인 결과를 바꾸지 않는다.
    try {
      void Promise.resolve(WebBrowser.dismissBrowser()).catch(() => undefined);
    } catch {
      // 동기 throw 도 무시
    }
  }

  if (!url) {
    throw new SocialCancelledError();
  }

  const { queryParams } = Linking.parse(url);
  // 동의 거부 등은 서버가 code 대신 error 를 실어 보낸다(브라우저에 우리 에러 화면을 띄우지 않으려고).
  if (typeof queryParams?.error === 'string') {
    throw new SocialCancelledError();
  }
  const code = queryParams?.code;
  if (typeof code !== 'string' || !code) {
    throw new Error('카카오 로그인 응답을 읽지 못했어요. 다시 시도해 주세요.');
  }
  return code;
}

/**
 * 인가 코드 → **우리 세션**. 서버가 카카오에 직접 물어 신원을 확인하고 토큰을 발급한다.
 *
 * ⚠️ **이메일·이름을 같이 보내지 않는다.** 앱이 보낸 값을 서버가 믿으면, 토큰은 진짜인데
 * 이메일만 남의 것으로 바꿔 계정을 가져갈 수 있다. 사실은 전부 서버가 카카오에서 가져온다.
 */
export async function kakaoLogin(code: string): Promise<CurrentUserType> {
  const res = await apiFetch<AuthResponseType>('/auth/social/kakao', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  await setTokens(res.accessToken, res.refreshToken);
  return res.user;
}
