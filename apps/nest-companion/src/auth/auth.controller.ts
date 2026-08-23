import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthResponseType,
  CurrentUserType,
  RefreshResponseType,
  SendCodeResponseType,
  VerifyCodeResponseType,
} from '@companion/types';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { SendCodeDto, VerifyCodeDto } from './dto/email-code.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { EmailVerificationService, PURPOSE_SIGNUP } from './email-verification.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly verification: EmailVerificationService,
    private readonly prisma: PrismaService,
    private readonly social: SocialService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 가입용 인증 코드 발송.
   *
   * ⚠️ **이미 가입된 이메일이면 409 로 알려준다**(제품 결정). 앱이 입력칸 아래에 바로 띄운다.
   * 대가로 계정 열거가 열린다는 걸 알고 택한 것이고, `login` 쪽의 동일 메시지 방어는 비용이 0이라
   * 그대로 둔다(나중에 여기를 조이면 다시 살아난다). 주소를 바꿔가며 훑는 열거는 이메일당 상한으로는
   * 못 막고 IP 단위 제한(`@nestjs/throttler`)이 있어야 한다 — 배포 전 청소 항목이다.
   */
  @Post('email/send-code')
  @HttpCode(200)
  async sendCode(@Body() dto: SendCodeDto): Promise<SendCodeResponseType> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('이미 가입된 이메일이에요.');
    }
    return this.verification.sendCode(dto.email, PURPOSE_SIGNUP);
  }

  /** 인증 코드 확인 → 가입에 쓸 증표 토큰 발급 */
  @Post('email/verify-code')
  @HttpCode(200)
  verifyCode(@Body() dto: VerifyCodeDto): Promise<VerifyCodeResponseType> {
    return this.verification.verifyCode(dto.email, PURPOSE_SIGNUP, dto.code);
  }

  /** 회원가입 → 세션(access + refresh) 발급. **증표 토큰이 있어야 한다.** */
  @Post('signup')
  signup(@Body() dto: SignupDto): Promise<AuthResponseType> {
    return this.auth.signup(dto);
  }

  /** 로그인 → 세션(access + refresh) 발급 */
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<AuthResponseType> {
    return this.auth.login(dto);
  }

  /**
   * 소셜 로그인 1단계 — 브라우저를 provider 인증 화면으로 보낸다.
   *
   * **앱이 카카오 URL 을 직접 만들지 않고 이 주소를 여는 게 요점**이다. 그래야 `redirect_uri` 와
   * REST API 키를 서버 혼자 알고, 인증 때 쓴 값과 토큰 교환 때 쓴 값이 어긋날 수가 없다.
   */
  @Get('social/:provider/authorize')
  @Redirect()
  async authorizeSocial(@Param('provider') raw: string): Promise<{ url: string }> {
    const provider = this.social.normalizeProvider(raw);
    const state = await this.auth.signOauthState(provider);
    return { url: this.social.authorizeUrl(provider, state) };
  }

  /**
   * 소셜 로그인 2단계 — provider 가 브라우저를 여기로 돌려보낸다.
   *
   * ⚠️ **이 시점에 앱은 아직 아무것도 모른다.** 브라우저만 서버에 와 있고 code 는 우리 손에 있다.
   * 그래서 앱을 깨우려면 앱 스킴으로 한 번 더 리다이렉트해야 한다.
   *
   * ⚠️ **여기서 로그인을 끝내고 우리 토큰을 실어 보내지 않는다.** 리다이렉트 URL 은 브라우저
   * 히스토리·중간 로그에 남는데, 거기에 30일짜리 refresh 토큰을 흘릴 수는 없다. 대신 카카오
   * code 를 넘긴다 — 1회용·단수명이고 **우리 client secret 없이는 아무 쓸모가 없어서**,
   * 일부러 "새어도 되는 것"만 이 경로로 보내는 셈이다.
   *
   * ⚠️ **`APP_REDIRECT_URL` 의 경로는 서버 라우트가 아니라 앱 화면**이다. Expo Go 는 `/--/` 뒤를
   * expo-router 에 넘기므로, 없는 경로를 넣으면 앱은 열리는데 "Unmatched Route" 가 뜬다(실측).
   */
  @Get('social/:provider/callback')
  @Redirect()
  async socialCallback(
    @Param('provider') raw: string,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<{ url: string }> {
    const provider = this.social.normalizeProvider(raw);
    // 사용자가 동의를 취소하면 code 대신 error 가 온다 — 서버 에러가 아니라 정상 흐름이라
    // 앱으로 그대로 넘겨 앱이 안내한다(브라우저에 우리 에러 화면을 띄우지 않는다).
    if (error || !code || !state) {
      return { url: this.appRedirect({ error: error || 'invalid_response' }) };
    }
    await this.auth.verifyOauthState(state, provider);
    return { url: this.appRedirect({ code, provider: provider.toLowerCase() }) };
  }

  /**
   * 소셜 로그인 3단계 — 앱이 받아온 code 를 검증하고 **우리 세션**을 발급한다.
   *
   * 여기서부터는 브라우저가 없어서, 네이티브 SDK 로 갈아타도 이 뒤는 전부 그대로다.
   */
  @Post('social/:provider')
  @HttpCode(200)
  async socialLogin(
    @Param('provider') raw: string,
    @Body() dto: SocialLoginDto,
  ): Promise<AuthResponseType> {
    const provider = this.social.normalizeProvider(raw);
    // ⚠️ 신원은 **서버가 provider 에서 직접 받아온다** — 앱이 보낸 이메일·이름을 쓰지 않는다.
    const identity = await this.social.fetchIdentity(provider, dto.code);
    return this.auth.socialLogin(identity);
  }

  /**
   * 브라우저를 앱으로 되돌릴 주소. 목적지를 **env 가 소유**한다.
   *
   * ⚠️ 앱이 "나를 여기로 보내줘"라고 넘기게 하면 편하지만 그건 **오픈 리다이렉트**다 —
   * 공격자가 자기 주소를 넣어 인가 코드를 받아갈 수 있다. 서버가 갈 곳을 고정하면 그 구멍이 없다.
   * (Expo Go 는 `exp://<LAN IP>:8081/--/auth/kakao`, 빌드된 앱은 `nativecompanion://auth/kakao`)
   */
  private appRedirect(params: Record<string, string>): string {
    const url = new URL(this.config.getOrThrow<string>('APP_REDIRECT_URL'));
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  /** access token 재발급 (refresh 회전) */
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshTokenDto): Promise<RefreshResponseType> {
    return this.auth.refresh(dto.refreshToken);
  }

  /** 로그아웃 — 해당 refresh 세션 폐기 (멱등) */
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  /** 현재 유저 조회 (access token 필요) */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() userId: string): Promise<CurrentUserType> {
    return this.auth.getCurrentUser(userId);
  }

  /** 현재 유저 이름 수정 */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() userId: string, @Body() dto: UpdateMeDto): Promise<CurrentUserType> {
    return this.auth.updateName(userId, dto.name);
  }

  /** 회원탈퇴 — 현재 유저와 관련 데이터 전부 삭제 (cascade) */
  @UseGuards(JwtAuthGuard)
  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() userId: string): Promise<void> {
    await this.auth.deleteAccount(userId);
  }
}
