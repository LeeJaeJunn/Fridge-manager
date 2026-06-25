import { ENV } from '@/config/env';

/**
 * 공용 fetch 래퍼. 모든 백엔드 호출은 이걸 거친다.
 * - ENV.apiUrl 기준으로 path 결합
 * - JSON 헤더 + dev 인증 헤더(x-user-id) 자동 첨부
 * - 에러 응답은 서버의 message 를 뽑아 Error 로 throw (class-validator 는 배열로 옴)
 *
 * ⚠️ 임시(dev): x-user-id 는 DevAuthGuard 용. 진짜 로그인 붙으면 Authorization 토큰으로 교체.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENV.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': ENV.devUserId,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const msg = Array.isArray(body?.message)
      ? body?.message.join(', ')
      : body?.message;
    throw new Error(msg ?? `요청 실패 (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
