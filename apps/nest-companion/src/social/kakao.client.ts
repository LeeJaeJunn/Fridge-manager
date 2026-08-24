import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SocialIdentityType } from './social.types';

const AUTH_HOST = 'https://kauth.kakao.com'; // 인가·토큰 발급
const API_HOST = 'https://kapi.kakao.com'; // 사용자 정보 조회

/** 토큰 발급 응답 — 우리가 쓰는 필드만. refresh_token 은 **일부러 안 받는다**(아래 참고). */
interface KakaoTokenResponse {
  access_token?: string;
}

/**
 * `GET /v2/user/me` 응답 — 우리가 쓰는 필드만.
 *
 * ⚠️ **전부 옵셔널이다.** 동의항목 설정·계정 상태에 따라 `kakao_account` 가 통째로 비거나
 * 이메일만 빠진다. 타입이 있다고 값이 있는 게 아니라서 런타임에 전부 확인한다.
 */
interface KakaoMeResponse {
  id?: number;
  kakao_account?: {
    email?: string;
    /** 카카오계정 이메일이 유효한가 (휴면·탈퇴 등이면 false) */
    is_email_valid?: boolean;
    /** 그 주소를 카카오가 **인증**했는가 — 계정 탈취 방어의 핵심 */
    is_email_verified?: boolean;
    profile?: { nickname?: string };
  };
}

/**
 * 카카오 로그인 — **벤더를 이 파일 안에 가둔다.**
 *
 * 바깥에 나가는 건 `authorizeUrl()` 과 `SocialIdentityType` 뿐이라, 호출자는 `kakao_account` 도
 * `KOE006` 도 모른다. `MailService`(Gmail SMTP)·`RecipeService`(네이버)와 같은 격리다.
 *
 * **왜 서버가 교환하는가**: `client_secret` 이 앱 번들에 들어가면 디컴파일로 뽑힌다. 그리고
 * code 는 `client_id` + `redirect_uri` + `secret` 셋에 묶여 있어서, 중간에 새어도 우리 없이는
 * 토큰으로 못 바꾼다 — 그래서 앱까지 code 를 흘려보내도 안전하다.
 *
 * ⚠️ **카카오 access token 은 프로필 조회에만 쓰고 저장하지 않는다.** 우리가 카카오 API 를
 * 대신 호출할 일이 없어서 보관할 이유가 없고, 보관하면 유출 표면만 는다. 그래서 토큰 응답의
 * `refresh_token` 도 안 받는다. 우리 세션은 우리 `RefreshSession` 이 따로 들고 있다.
 */
@Injectable()
export class KakaoClient {
  private readonly logger = new Logger(KakaoClient.name);
  private readonly restApiKey: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  /**
   * 카카오 로그인이 설정돼 있는지.
   *
   * ⚠️ **생성자에서 강제하지 않는다**(`getOrThrow` 금지) — CI 는 `.env` 없이 `AppModule` 을
   * 부팅해 e2e 를 돌리므로 여기서 던지면 `pnpm verify` 가 통째로 깨진다. `MailService` 와 같은 판단.
   */
  readonly isConfigured: boolean;

  constructor(config: ConfigService) {
    this.restApiKey = config.get<string>('KAKAO_REST_API_KEY') ?? '';
    // 콘솔 [보안] 에서 활성화했을 때만 존재한다. 꺼져 있으면 카카오가 이 값을 요구하지 않으므로
    // 빈 문자열이면 아예 안 보낸다(보내면 오히려 400).
    this.clientSecret = config.get<string>('KAKAO_CLIENT_SECRET') ?? '';
    this.redirectUri = config.get<string>('KAKAO_REDIRECT_URI') ?? '';

    this.isConfigured = Boolean(this.restApiKey && this.redirectUri);
    if (!this.isConfigured) {
      this.logger.warn(
        'KAKAO_REST_API_KEY/KAKAO_REDIRECT_URI 가 없어 카카오 로그인이 꺼져 있습니다.',
      );
    }
  }

  /**
   * 브라우저를 보낼 카카오 인증 URL.
   *
   * **앱이 아니라 서버가 만든다** — 그래야 `redirect_uri` 가 아래 `exchangeCode` 와 같은 값임이
   * 구조적으로 보장된다(둘이 한 글자라도 다르면 카카오가 `KOE006` 으로 거절한다). 덤으로 앱은
   * REST API 키를 몰라도 된다.
   *
   * `scope` 는 안 넘긴다 — 동의항목은 콘솔이 소유하고, 필수 동의로 설정된 항목은 자동으로 요구된다.
   */
  authorizeUrl(state: string): string {
    const url = new URL(`${AUTH_HOST}/oauth/authorize`);
    url.searchParams.set('client_id', this.restApiKey);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    // ⚠️ **매번 다시 로그인하게 한다.** 안 붙이면 브라우저에 남은 카카오 세션으로 화면 없이
    // 즉시 통과하는데, 그러면 **다른 계정으로 바꿔 로그인할 방법이 없다**(우리 앱에서 로그아웃해도
    // 카카오 쪽 세션은 그대로다). 개발 중 계정을 바꿔가며 테스트할 때도 이게 없으면 막힌다.
    // 대가는 재로그인이 한 번에 안 끝난다는 것 — 계정을 못 바꾸는 쪽이 더 나쁘다고 봤다.
    url.searchParams.set('prompt', 'login');
    return url.toString();
  }

  /** 인가 코드 → 검증된 신원. 실패는 전부 여기서 우리 예외로 바뀐다(벤더 에러가 안 샌다). */
  async fetchIdentity(code: string): Promise<SocialIdentityType> {
    const accessToken = await this.exchangeCode(code);
    return this.fetchProfile(accessToken);
  }

  /** code + secret → 카카오 access token */
  private async exchangeCode(code: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.restApiKey,
      // ⚠️ **인증 요청에 쓴 값과 글자까지 같아야 한다.** 다르면 KOE006.
      redirect_uri: this.redirectUri,
      code,
    });
    if (this.clientSecret) {
      body.set('client_secret', this.clientSecret);
    }

    const data = await this.call<KakaoTokenResponse>('토큰 교환', `${AUTH_HOST}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
    });
    if (!data.access_token) {
      this.logger.error('카카오 토큰 응답에 access_token 이 없습니다.');
      throw new ServiceUnavailableException('카카오 로그인에 실패했습니다.');
    }
    return data.access_token;
  }

  /**
   * access token → 신원. **여기가 "앱이 한 말"이 아니라 "카카오가 한 말"을 얻는 지점**이다.
   *
   * ⚠️ **이메일 검증 상태를 반드시 확인한다.** 안 하면 이렇게 계정이 털린다:
   * 공격자가 자기 카카오 계정의 이메일을 피해자 주소로 바꾼다(미인증 상태) → 우리가 그걸 믿고
   * 기존 유저에 연결한다 → **비밀번호를 몰라도 피해자 계정으로 로그인된다.**
   * 이메일을 필수 동의로 켜도 이 검사는 없어지지 않는다 — 동의 여부와 인증 여부는 다른 질문이다.
   */
  private async fetchProfile(accessToken: string): Promise<SocialIdentityType> {
    const data = await this.call<KakaoMeResponse>('사용자 조회', `${API_HOST}/v2/user/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const account = data.kakao_account;
    // `typeof` 로 보는 건 의도다 — 위 인터페이스는 우리가 **바라는** 모양일 뿐이고, 실제로 오는 건
    // 검증되지 않은 JSON 이라 타입이 보장해주지 않는다.
    if (typeof data.id !== 'number' || !account) {
      this.logger.error('카카오 사용자 응답에 id/kakao_account 가 없습니다.');
      throw new ServiceUnavailableException('카카오 로그인에 실패했습니다.');
    }

    if (!account.email) {
      throw new UnauthorizedException(
        '카카오 계정 이메일을 받지 못했어요. 이메일 제공에 동의한 뒤 다시 시도해 주세요.',
      );
    }
    // 값이 **참일 때만** 통과시킨다(fail closed). 필드가 아예 없는 경우도 "인증됨"으로 넘기지
    // 않는다 — 보안 검사에서 값이 없는 건 통과 사유가 아니다. (이메일을 필수 동의로 켜 두면
    // 둘 다 항상 오므로, 없는 건 우리가 모르는 상황이라는 뜻이고 그때 통과시킬 이유가 없다.)
    if (!account.is_email_verified || !account.is_email_valid) {
      // ⚠️ 이메일 주소를 로그에 남기지 않는다.
      this.logger.warn(
        `카카오 이메일 미검증 거절 (verified=${String(account.is_email_verified)}, valid=${String(account.is_email_valid)})`,
      );
      throw new UnauthorizedException(
        '카카오 계정 이메일이 인증되지 않았어요. 카카오에서 이메일을 인증한 뒤 다시 시도해 주세요.',
      );
    }

    return {
      provider: 'KAKAO',
      // 카카오는 숫자로 준다. `AuthIdentity.providerUserId` 는 String 이라 여기서 고정한다.
      providerUserId: String(data.id),
      email: account.email,
      nickname: account.profile?.nickname ?? null,
    };
  }

  /**
   * 카카오 호출 한 번 — 벤더 에러를 전부 여기서 우리 예외로 바꾼다.
   *
   * ⚠️ **요청 본문·토큰·code 를 로그에 남기지 않는다.** 응답 본문은 카카오가 주는 진단 메시지라
   * (`KOE006` 등) 남기는 값어치가 크고 비밀값이 없어서 그대로 찍는다.
   */
  private async call<T>(what: string, url: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      this.logger.error(`카카오 ${what} 호출 실패`, err as Error);
      throw new ServiceUnavailableException('카카오 서버에 연결하지 못했습니다.');
    }
    if (!res.ok) {
      this.logger.error(`카카오 ${what} 오류 (${res.status}): ${await res.text()}`);
      throw new ServiceUnavailableException('카카오 로그인에 실패했습니다.');
    }
    return (await res.json()) as T;
  }
}
