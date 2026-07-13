/**
 * HTTP 상태 코드를 담은 API 에러.
 * 호출부가 인증 만료(401/403)와 네트워크/서버 오류(status 없음/5xx)를 구분할 수 있게 한다.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
