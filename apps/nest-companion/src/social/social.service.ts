import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SOCIAL_PROVIDER_VALUES } from '../auth/providers';
import { KakaoClient } from './kakao.client';
import type { SocialIdentityType } from './social.types';

/**
 * provider 이름 → 벤더 클라이언트 **분기 한 곳**.
 *
 * 얇지만 여기 있어야 하는 이유는 분기점이 흩어지지 않게 하기 위해서다 — 네이버를 붙일 때
 * `NaverClient` 를 만들고 이 파일의 `client()` 에 한 줄 넣으면 끝이고, `AuthService` 와
 * `AuthController` 는 손대지 않는다.
 */
@Injectable()
export class SocialService {
  constructor(private readonly kakao: KakaoClient) {}

  /**
   * URL 경로의 provider(`/auth/social/kakao/...`)를 우리 어휘('KAKAO')로 정규화한다.
   *
   * ⚠️ **`SOCIAL_PROVIDER_VALUES` 로 거른다** — `LOCAL` 이 통과하면 비밀번호 없이 로그인되는
   * 경로가 열린다(`providers.ts` 참고).
   */
  normalizeProvider(raw: string): string {
    const provider = raw.trim().toUpperCase();
    if (!SOCIAL_PROVIDER_VALUES.includes(provider)) {
      throw new BadRequestException('지원하지 않는 로그인 수단입니다.');
    }
    return provider;
  }

  /** 브라우저를 보낼 인증 URL (서버가 만든다 — `KakaoClient.authorizeUrl` 주석 참고) */
  authorizeUrl(provider: string, state: string): string {
    return this.client(provider).authorizeUrl(state);
  }

  /** 인가 코드 → provider 가 검증해 준 신원 */
  fetchIdentity(provider: string, code: string): Promise<SocialIdentityType> {
    return this.client(provider).fetchIdentity(code);
  }

  private client(provider: string): KakaoClient {
    if (provider !== 'KAKAO') {
      // 어휘에는 있지만(NAVER·GOOGLE) 아직 클라이언트가 없는 상태. 400 이 아니라 503 인 건
      // 요청이 잘못된 게 아니라 서버가 아직 못 하는 것이기 때문이다.
      throw new ServiceUnavailableException('아직 지원하지 않는 로그인 수단입니다.');
    }
    if (!this.kakao.isConfigured) {
      throw new ServiceUnavailableException('카카오 로그인이 설정되지 않았습니다.');
    }
    return this.kakao;
  }
}
