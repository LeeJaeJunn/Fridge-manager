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

/** 회원가입 요청 본문 (이메일+비밀번호 = `LOCAL` 가입. 소셜은 별도 경로) */
export type SignupRequestType = {
  email: string;
  password: string;
  name?: string;
};

/** 로그인 요청 본문 (`LOCAL` 가입자만 — 소셜 유저는 비밀번호가 없다) */
export type LoginRequestType = {
  email: string;
  password: string;
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
