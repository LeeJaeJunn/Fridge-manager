import type { AuthResponseType, CurrentUserType, RefreshResponseType } from '@companion/types';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { SocialIdentityType } from '../social/social.types';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { normalizeEmail } from './email';
import {
  EmailVerificationService,
  PURPOSE_RESET,
  PURPOSE_SIGNUP,
} from './email-verification.service';
import { LOCAL_PROVIDER } from './providers';

const BCRYPT_ROUNDS = 10;

/**
 * OAuth `state` 수명. 인증 화면에서 동의를 누르기까지의 시간이라 넉넉할 이유가 없다 —
 * 짧을수록 가로챈 state 의 재사용 창이 좁아진다.
 */
const OAUTH_STATE_TTL = '10m';

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
          data: { email, emailVerified: verifiedAt, passwordHash },
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

  /**
   * 소셜 로그인 — **로그인 / 연결 / 신규가입 셋 중 하나로 갈린다.**
   *
   * 인자로 받는 `identity` 는 앱이 준 게 아니라 **서버가 provider 에서 직접 받아온 것**이다
   * (`SocialService`). 그래서 여기서는 그걸 사실로 취급해도 된다.
   *
   * 셋 다 한 트랜잭션이다 — 신원 행만 생기고 세션이 안 생기는 반쪽 상태를 막는다(`signup` 과 같다).
   */
  async socialLogin(identity: SocialIdentityType): Promise<AuthResponseType> {
    const email = normalizeEmail(identity.email);
    const { provider, providerUserId } = identity;
    const refresh = this.newRefresh();

    let user: UserRow;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        // ① 이미 이 수단으로 가입한 사람인가 → 그냥 로그인.
        //    ⚠️ **이메일이 그새 바뀌었어도 여기로 온다.** 이메일이 아니라 회원번호를 키로 쓴 이유다.
        //    findFirst 인 건 providerUserId 가 nullable 컬럼이라(LOCAL 때문) 복합 unique 를
        //    findUnique 로 조회하는 게 타입상 껄끄러워서다 — @@unique 인덱스가 그대로 쓰인다.
        const found = await tx.authIdentity.findFirst({
          where: { provider, providerUserId },
          select: { user: { select: USER_SELECT } },
        });
        if (found) return found.user;

        // ② 같은 이메일의 계정이 이미 있나 → **연결**(새 계정을 만들지 않는다).
        //    이게 없으면 이메일로 가입한 사람이 카카오로 들어왔을 때 계정이 갈라지고
        //    냉장고 재고가 한쪽에만 쌓인다 — 이 앱에선 치명적이다.
        //    ⚠️ 안전한 건 **오직 provider 가 이메일을 검증했기 때문**이다. 그 확인은
        //    벤더 클라이언트가 이미 했고(`KakaoClient.fetchProfile`), 미검증이면 여기 못 온다.
        const existing = await tx.user.findUnique({ where: { email }, select: USER_SELECT });
        if (existing) {
          await tx.authIdentity.create({ data: { userId: existing.id, provider, providerUserId } });
          return existing;
        }

        // ③ 처음 보는 사람 → 신규 가입. 비밀번호가 없고(소셜 전용), 이메일은 이미 검증됐다.
        //    닉네임을 `User.name` 초기값으로 쓴다 — 온보딩에서 사용자가 고칠 수 있다.
        const created = await tx.user.create({
          data: {
            email,
            emailVerified: new Date(),
            name: identity.nickname,
          },
          select: USER_SELECT,
        });
        await tx.authIdentity.create({ data: { userId: created.id, provider, providerUserId } });
        return created;
      });

      await this.prisma.refreshSession.create({
        data: { userId: user.id, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
      });
    } catch (err) {
      // 같은 사람이 동시에 두 번 로그인하면 ②/③ 이 겹쳐 unique 제약에 걸린다. 드물고,
      // 다시 누르면 ① 로 풀리므로 500 대신 재시도를 안내한다.
      if (isUniqueViolation(err)) {
        throw new ConflictException('로그인 처리가 겹쳤어요. 다시 시도해 주세요.');
      }
      throw err;
    }

    const accessToken = await this.signAccess(user.id);
    return { accessToken, refreshToken: refresh.raw, user: this.toCurrentUser(user) };
  }

  /**
   * OAuth `state` 발급 — **우리가 시작한 흐름만 콜백을 통과시키기 위한 끈**이다.
   *
   * 콜백(`/auth/social/:provider/callback`)은 공개 엔드포인트라 아무나 code 를 들고 때릴 수 있다.
   * 서버에 세션 저장소가 없으므로(모바일이라 쿠키도 없다) **상태를 저장하는 대신 서명해서
   * 브라우저에 맡긴다** — 우리 키로 서명했으니 위조가 안 되고, 짧은 만료로 재사용도 막힌다.
   *
   * ⚠️ `type` 이 'access' 가 아니라서 `JwtAuthGuard` 를 통과하지 못한다 — 이 토큰으로 API 를
   * 부를 수 없다는 뜻이고, 그게 의도다(가드가 `type` 을 확인하는 이유).
   */
  signOauthState(provider: string): Promise<string> {
    return this.jwt.signAsync({ type: 'oauth_state', provider }, { expiresIn: OAUTH_STATE_TTL });
  }

  /** `state` 검증 — 서명·만료·용도·provider 가 모두 맞아야 통과 */
  async verifyOauthState(state: string, provider: string): Promise<void> {
    let payload: { type?: unknown; provider?: unknown };
    try {
      payload = await this.jwt.verifyAsync(state);
    } catch {
      throw new UnauthorizedException('로그인 요청이 만료되었습니다. 다시 시도해 주세요.');
    }
    if (payload.type !== 'oauth_state' || payload.provider !== provider) {
      throw new UnauthorizedException('로그인 요청이 올바르지 않습니다.');
    }
  }

  /**
   * 비밀번호 재설정 — 이메일 인증을 통과한 사람이 새 비밀번호를 건다.
   *
   * ⚠️ **기존 `RefreshSession` 을 일부러 남긴다.** 보안 교과서는 전부 폐기하라고 하지만, 이 앱에서
   * 재설정하는 이유는 대부분 "털린 것 같다"가 아니라 **"비밀번호를 잊었다"** 다(제품 판단). 그때
   * 다른 기기까지 로그아웃시키면 아무 이득 없이 불편만 준다.
   * 대가: 계정이 실제로 털린 경우엔 **재설정만으로 공격자를 못 쫓아낸다.** 그 상황의 해법은
   * 계정 화면의 "모든 기기에서 로그아웃"이고, 필요해지면 그때 따로 만든다.
   *
   * ⚠️ **소셜 전용 유저(`passwordHash === null`)는 여기까지 오지 못한다** — 컨트롤러가 코드 발송
   * 단계에서 막는다. 여기서 한 번 더 보는 건 그 사이 상태가 바뀌었을 때를 위한 것이고,
   * 두 곳 다 있어야 "발송은 됐는데 마지막에 조용히 성공" 같은 구멍이 안 생긴다.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const email = normalizeEmail(dto.email);
    await this.verification.assertVerified(email, PURPOSE_RESET, dto.verificationToken);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      throw new NotFoundException('가입되지 않은 이메일이에요.');
    }
    if (!user.passwordHash) {
      throw new ConflictException('카카오로 가입된 계정이에요. 카카오 로그인을 이용해 주세요.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS) },
    });
    // 소비 — 다 썼으니 대기 중인 인증이 남을 이유가 없다(가입과 같은 처리).
    // (감사 로그는 `EmailVerificationService` 가 `purpose` 와 함께 이미 남긴다)
    await this.verification.clear(email, PURPOSE_RESET);
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
