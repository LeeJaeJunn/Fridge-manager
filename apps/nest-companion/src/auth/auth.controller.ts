import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  AuthResponseType,
  CurrentUserType,
  RefreshResponseType,
  SendCodeResponseType,
  VerifyCodeResponseType,
} from '@companion/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { SendCodeDto, VerifyCodeDto } from './dto/email-code.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { EmailVerificationService, PURPOSE_SIGNUP } from './email-verification.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly verification: EmailVerificationService,
    private readonly prisma: PrismaService,
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
