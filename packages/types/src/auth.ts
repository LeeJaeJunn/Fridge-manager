/** 현재 인증된 유저 (표시용 필드만 — passwordHash 등 민감값 제외) */
export type CurrentUserType = {
  id: string;
  loginId: string;
  name: string | null;
  createdAt: string;
};

/** 회원가입 요청 본문 */
export type SignupRequestType = {
  loginId: string;
  password: string;
  name?: string;
};

/** 로그인 요청 본문 */
export type LoginRequestType = {
  loginId: string;
  password: string;
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
