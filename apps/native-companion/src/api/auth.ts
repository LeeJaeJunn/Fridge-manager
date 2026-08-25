import { apiFetch } from '@/api/client';
import { clearTokens, getRefreshToken, setTokens } from '@/api/token';
import type {
  AuthResponseType,
  CurrentUserType,
  LoginRequestType,
  ResetPasswordRequestType,
  SendCodeRequestType,
  SendCodeResponseType,
  SignupRequestType,
  UpdateMeRequestType,
  VerifyCodeRequestType,
  VerifyCodeResponseType,
} from '@companion/types';

/**
 * 가입용 인증번호 발송. 이미 가입된 이메일이면 409 로 `ApiError` 가 던져진다.
 * 응답의 `retryAfterSec`·`expiresInSec`·`codeDigits` 는 **서버가 소유한 값**이라 그대로 쓴다.
 */
export function sendSignupCode(body: SendCodeRequestType): Promise<SendCodeResponseType> {
  return apiFetch<SendCodeResponseType>('/auth/email/send-code', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 인증번호 확인 → 가입에 쓸 증표 토큰. 틀리면 400 + 남은 횟수 메시지 */
export function verifySignupCode(body: VerifyCodeRequestType): Promise<VerifyCodeResponseType> {
  return apiFetch<VerifyCodeResponseType>('/auth/email/verify-code', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 재설정용 인증번호 발송. **가입과 조건이 정반대다** — 가입 안 된 이메일이면 404,
 * 카카오로 가입한 계정이면 409 로 `ApiError` 가 던져진다(메시지를 그대로 띄우면 된다).
 */
export function sendResetCode(body: SendCodeRequestType): Promise<SendCodeResponseType> {
  return apiFetch<SendCodeResponseType>('/auth/password/send-code', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 재설정 인증번호 확인 → 재설정에 쓸 증표 */
export function verifyResetCode(body: VerifyCodeRequestType): Promise<VerifyCodeResponseType> {
  return apiFetch<VerifyCodeResponseType>('/auth/password/verify-code', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 비밀번호 재설정 실행.
 *
 * ⚠️ **토큰을 돌려받지 않는다**(서버가 204). 새 비밀번호로 다시 로그인하게 해서, 방금 정한 값이
 * 실제로 통하는지 사용자가 그 자리에서 확인하게 하는 게 의도다.
 */
export async function resetPassword(body: ResetPasswordRequestType): Promise<void> {
  await apiFetch('/auth/password/reset', { method: 'POST', body: JSON.stringify(body) });
}

/** 로그인 → 토큰 저장 후 현재 유저 반환 */
export async function login(body: LoginRequestType): Promise<CurrentUserType> {
  const res = await apiFetch<AuthResponseType>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await setTokens(res.accessToken, res.refreshToken);
  return res.user;
}

/** 회원가입 → 토큰 저장 후 현재 유저 반환 */
export async function signup(body: SignupRequestType): Promise<CurrentUserType> {
  const res = await apiFetch<AuthResponseType>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await setTokens(res.accessToken, res.refreshToken);
  return res.user;
}

/** 현재 인증된 유저 조회 (access token 필요, 만료 시 client 가 자동 refresh) */
export function fetchMe(): Promise<CurrentUserType> {
  return apiFetch<CurrentUserType>('/auth/me');
}

/** 내 이름 수정 → 갱신된 유저 반환 */
export function updateMyName(body: UpdateMeRequestType): Promise<CurrentUserType> {
  return apiFetch<CurrentUserType>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/**
 * 회원탈퇴 — 서버에서 계정과 모든 데이터를 삭제(cascade)하고 로컬 토큰을 지운다.
 * 서버 삭제가 실패하면 토큰을 남겨(로그인 유지) 에러를 던진다 — 반쪽 탈퇴 방지.
 */
export async function deleteAccount(): Promise<void> {
  await apiFetch('/auth/me', { method: 'DELETE' });
  await clearTokens();
}

/** 로그아웃 — 서버의 refresh 세션을 폐기하고 로컬 토큰을 지운다 */
export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  try {
    if (refreshToken) {
      await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
    }
  } finally {
    // 서버 호출이 실패해도 로컬 토큰은 반드시 비운다.
    await clearTokens();
  }
}
