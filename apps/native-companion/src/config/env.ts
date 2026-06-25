/**
 * 앱 전역 환경설정. 모든 외부 URL/설정은 여기로 모은다.
 *
 * Expo 는 EXPO_PUBLIC_ 접두사가 붙은 .env 변수만 클라이언트에 노출한다.
 * 이 값들은 앱 번들에 그대로 박히므로 절대 비밀값(API 키 등)을 넣지 말 것.
 */
export const ENV = {
  /** 백엔드(nest) 베이스 URL — .env 의 EXPO_PUBLIC_API_URL 로 덮어쓸 수 있음 */
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
  /**
   * ⚠️ 임시(dev): 백엔드 DevAuthGuard 가 읽는 현재 유저 id (x-user-id 헤더로 전송).
   * 진짜 로그인 붙으면 제거하고 인증 토큰으로 대체한다.
   */
  devUserId: process.env.EXPO_PUBLIC_DEV_USER_ID ?? 'dev-user',
} as const;
