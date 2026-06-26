import { apiFetch } from '@/api/client';
import type { CurrentUserType } from '@companion/types';

/** 현재 인증된 유저 조회. dev 에서는 x-user-id 기반 DevAuthGuard 를 거친다. */
export function fetchMe(): Promise<CurrentUserType> {
  return apiFetch<CurrentUserType>('/auth/me');
}
