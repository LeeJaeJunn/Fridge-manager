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
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

const BCRYPT_ROUNDS = 10;

// 토큰 발급에 필요한 User 필드 (passwordHash 제외)
type UserRow = { id: string; loginId: string; name: string | null; createdAt: Date };

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
    config: ConfigService,
  ) {
    const days = Number(config.get<string>('REFRESH_TTL_DAYS') ?? '30');
    this.refreshTtlMs = days * 24 * 60 * 60 * 1000;
  }

  async signup(dto: SignupDto): Promise<AuthResponseType> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const refresh = this.newRefresh();

    let user: UserRow;
    try {
      // 유저 생성 + 최초 세션을 한 트랜잭션으로 — 세션 생성이 실패하면 유저도 롤백(반쪽 가입 방지).
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { loginId: dto.loginId, passwordHash, name: dto.name ?? null },
          select: { id: true, loginId: true, name: true, createdAt: true },
        });
        await tx.refreshSession.create({
          data: { userId: created.id, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
        });
        return created;
      });
    } catch (err) {
      // 사전 조회 없이 unique 제약으로 중복을 판정 → 동시 가입 경합도 409 로 안전하게 변환.
      if (isUniqueViolation(err)) {
        throw new ConflictException('이미 사용 중인 아이디예요.');
      }
      throw err;
    }

    const accessToken = await this.signAccess(user.id);
    return { accessToken, refreshToken: refresh.raw, user: this.toCurrentUser(user) };
  }

  async login(dto: LoginDto): Promise<AuthResponseType> {
    const user = await this.prisma.user.findUnique({ where: { loginId: dto.loginId } });
    // 유저가 없어도 동일 비용의 비교를 수행 → 타이밍으로 계정 존재 여부가 새지 않게 한다.
    // 메시지도 아이디 없음/비번 불일치 모두 동일 (계정 존재 여부 노출 방지).
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? this.dummyHash);
    if (!user || !ok) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
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
      select: { id: true, loginId: true, name: true, createdAt: true },
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
      select: { id: true, loginId: true, name: true, createdAt: true },
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
      loginId: user.loginId,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
