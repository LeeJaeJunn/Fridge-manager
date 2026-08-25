/**
 * 현재 인증된 유저 (표시용 필드만 — passwordHash 등 민감값 제외).
 *
 * 로그인 키는 **이메일**이다(예전 `loginId` 임의 문자열을 대체). 이메일은 인증 수단이라기보다
 * "사람 동일성"의 축이다 — 카카오 id 와 구글 id 는 서로 무관해서, 이메일이 없으면 같은 사람이
 * 두 수단으로 로그인했을 때 동일인인지 알 방법이 없다.
 */
export type CurrentUserType = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

/** 인증 코드 발송 요청 (`POST /auth/email/send-code`) */
export type SendCodeRequestType = {
  email: string;
};

/**
 * 인증 코드 발송 응답.
 *
 * **숫자를 앱에 하드코딩하지 말고 이 값을 쓴다** — 앱이 자기 상수를 들고 있으면 서버와 어긋나
 * "재전송 가능"으로 보이는데 429 를 맞는다. 제한값의 주인은 서버다(`GET /inventory/options` 와 같은 방식).
 */
export type SendCodeResponseType = {
  /** 재전송까지 기다려야 하는 초 — 카운트다운에 쓴다 */
  retryAfterSec: number;
  /** 코드 유효 시간(초) */
  expiresInSec: number;
  /** 코드 자리수 — 입력칸 `maxLength`·자동 제출 기준. 앱이 6을 박아두지 않게 서버가 준다 */
  codeDigits: number;
};

/** 인증 코드 확인 요청 (`POST /auth/email/verify-code`) */
export type VerifyCodeRequestType = {
  email: string;
  code: string;
};

/**
 * 인증 코드 확인 응답 — **증표 토큰**.
 * 이걸 `signup` 에 그대로 실어 보내야 가입이 된다(코드를 본 클라이언트만 가입하게 하는 끈).
 */
export type VerifyCodeResponseType = {
  verificationToken: string;
};

/** 회원가입 요청 본문 (이메일+비밀번호 = `LOCAL` 가입. 소셜은 별도 경로) */
export type SignupRequestType = {
  email: string;
  password: string;
  /** `verify-code` 가 준 증표. 이메일 인증을 통과했다는 증명이라 필수다. */
  verificationToken: string;
};

/**
 * 비밀번호 재설정 요청 본문 (`POST /auth/password/reset`).
 *
 * 가입과 **같은 3단계**(코드 발송 → 확인 → 실행)를 타고, 증표도 같은 방식이다.
 * 다만 코드의 용도(`purpose`)가 갈려 있어 **가입용 코드로는 비밀번호를 못 바꾼다**.
 */
export type ResetPasswordRequestType = {
  email: string;
  /** 새 비밀번호 */
  password: string;
  /** `password/verify-code` 가 준 증표 */
  verificationToken: string;
};

/** 로그인 요청 본문 (`LOCAL` 가입자만 — 소셜 유저는 비밀번호가 없다) */
export type LoginRequestType = {
  email: string;
  password: string;
};

/**
 * 소셜 로그인 요청 본문 (`POST /auth/social/:provider`).
 *
 * **앱이 보내는 건 "증거"뿐이고 "사실"은 서버가 provider 에서 직접 가져온다.** 이메일·이름을
 * 앱이 실어 보내면 그 값만 바꿔치기해 남의 계정으로 로그인할 수 있다(앱은 사용자 손 안의 코드다).
 *
 * 지금은 웹 OAuth 라 `code` 다. 네이티브 SDK 를 붙이면 앱이 code 대신 provider 의 access token 을
 * 쥐게 되므로 그때 필드가 하나 더 생긴다(서버는 둘 다 받고, 그 뒤 처리는 완전히 같다).
 */
export type SocialLoginRequestType = {
  /** provider 가 준 인가 코드. 1회용·단수명이고 서버의 client secret 없이는 쓸모가 없다. */
  code: string;
};

/** 내 정보 수정 요청 본문 (PATCH /auth/me) */
export type UpdateMeRequestType = {
  name: string;
};

/**
 * 인증 성공 응답 (회원가입/로그인).
 * - accessToken: 짧은 수명(15분). 모든 API 요청의 Authorization: Bearer 로 사용.
 * - refreshToken: 긴 수명(30일). accessToken 재발급(POST /auth/refresh)에만 사용.
 */
export type AuthResponseType = {
  accessToken: string;
  refreshToken: string;
  user: CurrentUserType;
};

/** accessToken 재발급 요청/응답 (refresh 토큰 회전) */
export type RefreshRequestType = {
  refreshToken: string;
};

export type RefreshResponseType = {
  accessToken: string;
  refreshToken: string;
};

/** 로그아웃 요청 — 해당 refresh 세션을 서버에서 폐기 */
export type LogoutRequestType = {
  refreshToken: string;
};
