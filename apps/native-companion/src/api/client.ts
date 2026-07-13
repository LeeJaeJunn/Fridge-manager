import { ENV } from '@/config/env';
import { emitAuthExpired } from '@/api/auth-events';
import { ApiError } from '@/api/errors';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/api/token';

// refresh 를 태우면 안 되는 인증 변경 엔드포인트(재귀 방지). /auth/me 는 제외 → 만료 시 자동 갱신됨.
const AUTH_NO_RETRY = new Set(['/auth/login', '/auth/signup', '/auth/refresh', '/auth/logout']);

/**
 * 공용 fetch 래퍼. 모든 백엔드 호출은 이걸 거친다.
 * - ENV.apiUrl 기준으로 path 결합, JSON 헤더 + access token(Authorization: Bearer) 자동 첨부
 * - access 만료(401)면 refresh 로 새 access 를 받아 **1회 자동 재시도** (사용자는 만료를 못 느낌)
 * - refresh 가 확정 실패(400/401/403)면 토큰을 비운다 → 앱은 자연히 로그인 상태로 돌아감.
 *   일시 오류(5xx/429/네트워크)면 토큰을 유지하고 에러를 전달(재시도 가능).
 * - 에러 응답은 서버의 message(status 포함)를 담아 ApiError 로 throw (class-validator 는 배열로 옴)
 *
 * 토큰 폐기의 소유권은 이 파일 한 곳에 둔다 — 상위(auth.tsx)는 상태만 반영하고 토큰을 직접 지우지 않는다.
 */
async function rawFetch(
  path: string,
  init: RequestInit | undefined,
  accessToken: string | null,
): Promise<Response> {
  return fetch(`${ENV.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
}

// 동시에 여러 요청이 401 을 받아도 refresh 는 한 번만 (single-flight)
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        // refresh 자체가 없음 = 세션 사망 → 남은 토큰 정리 + 전역 인증 해제
        await clearTokens();
        emitAuthExpired();
        return null;
      }
      const res = await fetch(`${ENV.apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.ok) {
        const data = (await res.json()) as { accessToken: string; refreshToken: string };
        await setTokens(data.accessToken, data.refreshToken);
        return data.accessToken;
      }
      // 세션이 확실히 무효(만료·재사용·형식오류)면 폐기 + 인증 해제.
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        await clearTokens();
        emitAuthExpired();
        return null;
      }
      // 일시 오류(5xx/429 등)는 토큰을 유지하고 에러를 던진다 → 호출부가 401 이 아닌 오류로 인지해 재시도.
      throw new ApiError(res.status, '토큰 갱신에 실패했습니다.');
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const access = await getAccessToken();
  let res = await rawFetch(path, init, access);

  // access 만료 → refresh 로 재발급 후 1회 재시도. 인증 변경 엔드포인트는 재시도하지 않는다(무한루프 방지).
  if (res.status === 401 && !AUTH_NO_RETRY.has(path)) {
    const renewed = await refreshAccessToken();
    if (renewed) res = await rawFetch(path, init, renewed);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const msg = Array.isArray(body?.message) ? body?.message.join(', ') : body?.message;
    throw new ApiError(res.status, msg ?? `요청 실패 (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
