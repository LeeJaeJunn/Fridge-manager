import { IsString, MaxLength, MinLength } from 'class-validator';
import type { SocialLoginRequestType } from '@companion/types';

/**
 * POST /auth/social/:provider 요청 본문.
 *
 * ⚠️ **필드가 `code` 하나뿐인 게 설계다.** 이메일·이름을 받지 않는다 — 앱이 보낸 값을 믿으면
 * 토큰은 진짜인데 이메일만 남의 것으로 바꿔 계정을 탈취할 수 있다. 사실은 전부 서버가
 * provider 에서 직접 조회한다(`KakaoClient.fetchProfile`).
 *
 * provider 는 URL 경로에서 온다(`SocialService.normalizeProvider` 가 검증).
 */
export class SocialLoginDto implements SocialLoginRequestType {
  // 길이 상한은 형식 검증이 아니라 **쓰레기 본문 차단**이다 — 인가 코드는 수십 자 수준이고,
  // 어차피 틀리면 카카오가 거절하므로 여기서 형식을 흉내 낼 이유가 없다.
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  code!: string;
}
