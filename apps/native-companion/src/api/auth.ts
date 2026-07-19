import { apiFetch } from '@/api/client';
import { clearTokens, getRefreshToken, setTokens } from '@/api/token';
import type {
  AuthResponseType,
  CurrentUserType,
  LoginRequestType,
  SignupRequestType,
  UpdateMeRequestType,
} from '@companion/types';

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
