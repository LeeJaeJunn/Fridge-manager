/**
 * 소셜 로그인에서 **벤더 밖으로 나가는 유일한 모양**.
 *
 * `KakaoClient` 는 `kakao_account.is_email_verified` 같은 카카오 어휘를 알지만,
 * `AuthService` 는 이 타입만 안다 — 네이버를 붙여도 `AuthService` 는 안 바뀐다.
 * `RecipeType`(네이버 검색)·`OcrResultType`(CLOVA)과 같은 자리다.
 */
export type SocialIdentityType = {
  /** 'KAKAO' | 'NAVER' | … — `AuthIdentity.provider` 에 그대로 들어간다 */
  provider: string;
  /**
   * 그쪽 서비스의 회원번호. **이메일이 아니라 이게 키다** — 이메일은 바뀌지만 회원번호는 안 바뀐다.
   * 카카오는 숫자로 주지만 `AuthIdentity.providerUserId` 가 String 이라 여기서 문자열로 고정한다
   * (네이버는 애초에 문자열이라, 벤더마다 다른 걸 여기서 흡수한다).
   */
  providerUserId: string;
  /**
   * **provider 가 검증한 이메일만 담긴다.** 미검증 주소는 벤더 클라이언트가 거부하므로
   * 여기까지 오지 않는다 — 그 검사가 계정 탈취를 막는 유일한 방어선이다(아래 참고).
   */
  email: string;
  /** 표시용 이름. 없을 수 있어서 nullable — 있으면 `User.name` 초기값으로 쓴다 */
  nickname: string | null;
};
