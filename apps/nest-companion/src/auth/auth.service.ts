import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AuthResponseType, CurrentUserType, RefreshResponseType } from '@companion/types';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from './email';
import { EmailVerificationService, PURPOSE_SIGNUP } from './email-verification.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { LOCAL_PROVIDER } from './providers';

const BCRYPT_ROUNDS = 10;

// 토큰 발급에 필요한 User 필드 (passwordHash 제외)
type UserRow = { id: string; email: string; name: string | null; createdAt: Date };

const USER_SELECT = { id: true, email: true, name: true, createdAt: true } as const;

// 새로 발급할 refresh 토큰 한 벌 (원문 + 저장용 해시 + 만료)
type NewRefresh = { raw: string; tokenHash: string; expiresAt: Date };

/** Prisma unique 제약 위반(P2002) 인지 판별 */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

/**
 * 회원가입/로그인으로 세션(access + refresh)을 발급하고, refresh 회전/폐기를 담당한다.
 * - access token: JWT(서명, `{ sub, type:'access' }`), 15분. API 인증용 (JwtAuthGuard 가 검증).
 * - refresh token: 랜덤 문자열, 30일. 원문은 저장하지 않고 sha256 해시만 RefreshSession 에 저장.
 *   재발급(refresh) 시 옛 세션을 폐기하고 새 세션을 발급한다(회전). 로그아웃 시 세션을 삭제한다.
 * 유저 생성+세션, 회전(삭제+생성)은 모두 트랜잭션으로 원자화한다(반쪽 성공/경합 방지).
 */
@Injectable()
export class AuthService {
  private readonly refreshTtlMs: number;
  // 존재하지 않는 유저 로그인 시에도 비교를 수행해 응답 시간을 균등화(계정 열거 타이밍 공격 방지)
  private readonly dummyHash = bcrypt.hashSync('companion-timing-guard', BCRYPT_ROUNDS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly verification: EmailVerificationService,
    config: ConfigService,
  ) {
    const days = Number(config.get<string>('REFRESH_TTL_DAYS') ?? '30');
    this.refreshTtlMs = days * 24 * 60 * 60 * 1000;
  }

  /**
   * 이메일+비밀번호 가입 (`LOCAL`). 소셜 가입은 별도 경로이고 여기를 타지 않는다.
   *
   * **이메일 인증을 먼저 통과해야 한다** — `verify-code` 가 준 증표를 대조하고, 그때 실제로
   * 코드를 맞춘 시각(`verifiedAt`)을 `emailVerified` 에 넣는다(지금 시각이 아니라 그때가 진실).
   */
  async signup(dto: SignupDto): Promise<AuthResponseType> {
    const email = normalizeEmail(dto.email);
    const verifiedAt = await this.verification.assertVerified(
      email,
      PURPOSE_SIGNUP,
      dto.verificationToken,
    );
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const refresh = this.newRefresh();

    let user: UserRow;
    try {
      // 유저 + 로그인 수단 + 최초 세션을 한 트랜잭션으로 — 하나라도 실패하면 전부 롤백(반쪽 가입 방지).
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email, emailVerified: verifiedAt, passwordHash, name: dto.name ?? null },
          select: USER_SELECT,
        });
        // ⚠️ **`LOCAL` 신원 행을 반드시 함께 만든다.** 이게 없으면 "이 이메일은 어느 수단으로
        // 가입됐나" 조회가 빈 목록을 돌려주고, 나중에 소셜 충돌 안내가 성립하지 않는다.
        // `providerUserId` 는 null — 외부 서비스가 없어서 저쪽 번호라는 게 존재하지 않는다.
        await tx.authIdentity.create({
          data: { userId: created.id, provider: LOCAL_PROVIDER, providerUserId: null },
        });
        await tx.refreshSession.create({
          data: { userId: created.id, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
        });
        return created;
      });
    } catch (err) {
      // 사전 조회 없이 unique 제약으로 중복을 판정 → 동시 가입 경합도 409 로 안전하게 변환.
      if (isUniqueViolation(err)) {
        throw new ConflictException('이미 가입된 이메일이에요.');
      }
      throw err;
    }

    // 소비 — 가입이 끝났으니 대기 중인 인증이 남을 이유가 없다.
    // 트랜잭션 밖인 건 의도다: 여기서 실패해도 이메일이 이미 unique 라 재사용으로 계정이
    // 하나 더 생기지 않고, 남은 행은 10분이면 만료된다.
    await this.verification.clear(email, PURPOSE_SIGNUP);

    const accessToken = await this.signAccess(user.id);
    return { accessToken, refreshToken: refresh.raw, user: this.toCurrentUser(user) };
  }

  /**
   * 이메일+비밀번호 로그인.
   *
   * ⚠️ **소셜 전용 유저는 `passwordHash` 가 null 이라 여기로 못 들어온다.** 그 경우에도
   * 더미 해시로 비교해 "가입 안 된 이메일"과 구분이 안 가게 한다 — 안 그러면 응답만 보고
   * "이 이메일은 카카오로 가입돼 있다"를 알아낼 수 있다(계정 열거).
   */
  async login(dto: LoginDto): Promise<AuthResponseType> {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    // 유저가 없어도(또는 비밀번호가 없어도) 동일 비용의 비교를 수행 → 타이밍으로 계정 존재 여부가
    // 새지 않게 한다. 메시지도 이메일 없음/비번 불일치 모두 동일 (계정 존재 여부 노출 방지).
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? this.dummyHash);
    if (!user || !user.passwordHash || !ok) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const refresh = this.newRefresh();
    await this.prisma.refreshSession.create({
      data: { userId: user.id, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
    });
    // 기회적 정리: 이 유저의 만료된 세션을 청소(안 쓰고 남은 세션 누적 방지)
    await this.prisma.refreshSession.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });
    const accessToken = await this.signAccess(user.id);
    return { accessToken, refreshToken: refresh.raw, user: this.toCurrentUser(user) };
  }

  /** 현재 유저 조회 (GET /auth/me) — 표시용 필드만 반환 */
  async getCurrentUser(userId: string): Promise<CurrentUserType> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('유저를 찾을 수 없습니다.');
    }
    return this.toCurrentUser(user);
  }

  /** 현재 유저 이름 수정 (PATCH /auth/me) */
  async updateName(userId: string, name: string): Promise<CurrentUserType> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name },
      select: USER_SELECT,
    });
    return this.toCurrentUser(user);
  }

  /** refresh 토큰으로 access 재발급 + refresh 회전 (삭제+생성을 원자화) */
  async refresh(rawToken: string): Promise<RefreshResponseType> {
    const tokenHash = this.hashToken(rawToken);
    const session = await this.prisma.refreshSession.findUnique({ where: { tokenHash } });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      // 폐기됐거나 만료된 토큰 → 남아있으면 정리하고 거절 (deleteMany 라 이미 지워졌어도 안전)
      if (session) {
        await this.prisma.refreshSession.deleteMany({ where: { id: session.id } });
      }
      throw new UnauthorizedException('세션이 만료되었습니다. 다시 로그인해 주세요.');
    }

    const next = this.newRefresh();
    const accessToken = await this.signAccess(session.userId);
    await this.prisma.$transaction(async (tx) => {
      // 옛 세션 삭제가 정확히 1건이어야 회전 성공. 동시 요청이면 진 쪽은 count 0 → 재사용 거절(500 아님).
      const deleted = await tx.refreshSession.deleteMany({ where: { id: session.id, tokenHash } });
      if (deleted.count !== 1) {
        throw new UnauthorizedException('이미 사용된 세션입니다.');
      }
      await tx.refreshSession.create({
        data: { userId: session.userId, tokenHash: next.tokenHash, expiresAt: next.expiresAt },
      });
    });
    return { accessToken, refreshToken: next.raw };
  }

  /** 로그아웃 — 해당 refresh 세션 폐기 (없어도 성공, 멱등) */
  async logout(rawToken: string): Promise<void> {
    await this.prisma.refreshSession.deleteMany({ where: { tokenHash: this.hashToken(rawToken) } });
  }

  /**
   * 회원탈퇴 — 유저를 삭제한다. 캐릭터·대화·메시지·메모리·refresh 세션은 onDelete:Cascade 로 함께 삭제.
   * deleteMany 라 이미 지워졌어도 안전(멱등). 발급된 access token 은 stateless(JWT)라 만료까지 남지만,
   * 유저가 없으니 이후 소유권 쿼리는 빈 결과가 되고 클라가 토큰을 비우면 끝난다.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.user.deleteMany({ where: { id: userId } });
  }

  private signAccess(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, type: 'access' });
  }

  private newRefresh(): NewRefresh {
    const raw = randomBytes(32).toString('hex');
    return {
      raw,
      tokenHash: this.hashToken(raw),
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
    };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private toCurrentUser(user: UserRow): CurrentUserType {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
