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
  // ⚠️ **경로가 `login` 인 게 핵심이다** — 이 딥링크는 우리에게만 오는 게 아니라 **expo-router
  // 에도 간다.** 없는 경로(`auth/kakao` 등)를 쓰면 라우터가 "Unmatched Route" 화면을 띄운다
  // (실제로 겪었다). 지금 보고 있는 화면을 가리키면 라우터 입장에선 제자리라 아무 일도 안 난다.
  //
  // 전용 라우트를 새로 만드는 방법도 있지만 그쪽이 더 나쁘다: 로그인이 실패했을 때(미인증 이메일 등)
  // 빠져나올 길 없는 화면에 갇힌다.
  const returnUrl = Linking.createURL('login');
  if (__DEV__) {
    // 이 값은 Expo Go 가 Metro 에 어떻게 붙었느냐에 따라 달라져서 추측으로는 못 맞춘다.
    // 서버 .env 에 넣을 값을 여기서 확인한다.
    console.log('[kakao] 서버 .env 의 APP_REDIRECT_URL 에 넣을 값:', returnUrl);
  }

  const result = await WebBrowser.openAuthSessionAsync(
    `${ENV.apiUrl}/auth/social/kakao/authorize`,
    returnUrl,
  );
  // 'cancel'(사용자가 닫음) / 'dismiss'(앱이 닫음) — 둘 다 실패가 아니라 취소다.
  if (result.type !== 'success') {
    throw new SocialCancelledError();
  }

  const { queryParams } = Linking.parse(result.url);
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
