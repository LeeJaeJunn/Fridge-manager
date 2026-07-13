import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthResponseType, CurrentUserType, RefreshResponseType } from '@companion/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /** 회원가입 → 세션(access + refresh) 발급 */
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
  async me(@CurrentUser() userId: string): Promise<CurrentUserType> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, loginId: true, name: true, createdAt: true },
    });
    if (!user) {
      throw new NotFoundException('유저를 찾을 수 없습니다.');
    }
    return { ...user, createdAt: user.createdAt.toISOString() };
  }
}
