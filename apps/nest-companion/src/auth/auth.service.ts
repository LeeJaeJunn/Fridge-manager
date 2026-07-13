import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AuthResponseType, CurrentUserType, RefreshResponseType } from '@companion/types';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

const BCRYPT_ROUNDS = 10;

// 토큰 발급에 필요한 User 필드 (passwordHash 제외)
type UserRow = { id: string; loginId: string; name: string | null; createdAt: Date };

/**
 * 회원가입/로그인으로 세션(access + refresh)을 발급하고, refresh 회전/폐기를 담당한다.
 * - access token: JWT(서명), 15분. API 인증용 (JwtAuthGuard 가 검증).
 * - refresh token: 랜덤 문자열, 30일. 원문은 저장하지 않고 sha256 해시만 RefreshSession 에 저장.
 *   재발급(refresh) 시 옛 세션을 폐기하고 새 세션을 발급한다(회전). 로그아웃 시 세션을 삭제한다.
 */
@Injectable()
export class AuthService {
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    const days = Number(config.get<string>('REFRESH_TTL_DAYS') ?? '30');
    this.refreshTtlMs = days * 24 * 60 * 60 * 1000;
  }

  async signup(dto: SignupDto): Promise<AuthResponseType> {
    const exists = await this.prisma.user.findUnique({ where: { loginId: dto.loginId } });
    if (exists) {
      throw new ConflictException('이미 사용 중인 아이디예요.');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { loginId: dto.loginId, passwordHash, name: dto.name ?? null },
    });
    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseType> {
    const user = await this.prisma.user.findUnique({ where: { loginId: dto.loginId } });
    // 아이디 없음/비번 불일치 모두 같은 메시지 (계정 존재 여부 노출 방지)
    const ok = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !ok) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    return this.issueSession(user);
  }

  /** refresh 토큰으로 access 재발급 + refresh 회전 */
  async refresh(rawToken: string): Promise<RefreshResponseType> {
    const tokenHash = this.hashToken(rawToken);
    const session = await this.prisma.refreshSession.findUnique({ where: { tokenHash } });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      // 폐기됐거나 만료된 토큰 → 남아있으면 정리하고 거절
      if (session) {
        await this.prisma.refreshSession
          .delete({ where: { id: session.id } })
          .catch(() => undefined);
      }
      throw new UnauthorizedException('세션이 만료되었습니다. 다시 로그인해 주세요.');
    }
    // 회전: 옛 세션 폐기 + 새 세션 발급
    await this.prisma.refreshSession.delete({ where: { id: session.id } });
    return this.createTokens(session.userId);
  }

  /** 로그아웃 — 해당 refresh 세션 폐기 (없어도 성공, 멱등) */
  async logout(rawToken: string): Promise<void> {
    await this.prisma.refreshSession.deleteMany({ where: { tokenHash: this.hashToken(rawToken) } });
  }

  private async issueSession(user: UserRow): Promise<AuthResponseType> {
    const tokens = await this.createTokens(user.id);
    return { ...tokens, user: this.toCurrentUser(user) };
  }

  private async createTokens(userId: string): Promise<RefreshResponseType> {
    const accessToken = await this.jwt.signAsync({ sub: userId });
    const refreshToken = randomBytes(32).toString('hex');
    await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });
    return { accessToken, refreshToken };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private toCurrentUser(user: UserRow): CurrentUserType {
    return {
      id: user.id,
      loginId: user.loginId,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
