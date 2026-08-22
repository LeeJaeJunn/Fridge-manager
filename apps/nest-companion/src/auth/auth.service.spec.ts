import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailVerificationService } from './email-verification.service';

type CreateUserArg = { data: { email: string; passwordHash: string; name?: string | null } };
type CreateIdentityArg = {
  data: { userId: string; provider: string; providerUserId: string | null };
};

type PrismaMock = {
  user: { findUnique: jest.Mock; create: jest.Mock<Promise<unknown>, [CreateUserArg]> };
  authIdentity: { create: jest.Mock<Promise<unknown>, [CreateIdentityArg]> };
  refreshSession: {
    create: jest.Mock;
    findUnique: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

/** 가입 스펙이 매번 넘겨야 하는 증표 — 실제 검증은 EmailVerificationService 스펙이 본다. */
const VERIFIED_AT = new Date('2026-01-01T00:00:00.000Z');
const SIGNUP_INPUT = {
  email: 'newbie@example.com',
  password: 'password123',
  verificationToken: 'verify-token',
};

describe('AuthService', () => {
  let prisma: PrismaMock;
  let jwt: { signAsync: jest.Mock };
  let verification: { assertVerified: jest.Mock; clear: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      authIdentity: { create: jest.fn().mockResolvedValue(undefined) },
      refreshSession: {
        create: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    // 트랜잭션은 콜백에 같은 mock 을 tx 로 넘겨 실행 (원자성 자체가 아니라 흐름을 검증)
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
    jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt.token') };
    verification = {
      assertVerified: jest.fn().mockResolvedValue(VERIFIED_AT),
      clear: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      verification as unknown as EmailVerificationService,
      config,
    );
  });

  describe('signup', () => {
    it('unique 위반(P2002)이면 ConflictException', async () => {
      prisma.user.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.signup({ ...SIGNUP_INPUT, email: 'taken@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('성공 시 비번을 해시로 저장하고 세션 토큰을 발급', async () => {
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'newbie@example.com',
        name: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const res = await service.signup(SIGNUP_INPUT);

      const created = prisma.user.create.mock.calls[0][0];
      expect(created.data.email).toBe('newbie@example.com');
      expect(created.data.passwordHash).not.toBe('password123'); // 원문 저장 금지
      await expect(bcrypt.compare('password123', created.data.passwordHash)).resolves.toBe(true);

      expect(res.accessToken).toBe('access.jwt.token');
      expect(res.refreshToken).toEqual(expect.any(String));
      expect(res.user).toEqual({
        id: 'u1',
        email: 'newbie@example.com',
        name: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      expect(prisma.refreshSession.create).toHaveBeenCalledTimes(1);
    });

    // 이걸 빠뜨려도 가입은 성공하고 로그인도 된다 — 나중에 소셜 충돌 안내를 붙일 때가 돼서야
    // "가입 수단이 하나도 없는 유저"가 드러난다. 조용히 깨지는 종류라 스펙으로 고정한다.
    it('LOCAL 신원 행을 함께 만든다 (providerUserId 는 null)', async () => {
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'newbie@example.com',
        name: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await service.signup(SIGNUP_INPUT);

      expect(prisma.authIdentity.create).toHaveBeenCalledTimes(1);
      expect(prisma.authIdentity.create.mock.calls[0][0].data).toEqual({
        userId: 'u1',
        provider: 'LOCAL',
        providerUserId: null, // 외부 서비스가 없어서 저쪽 번호라는 게 존재하지 않는다
      });
    });

    // 대소문자를 안 맞추면 `email @unique` 를 통과해 **같은 사람의 계정이 두 개** 생긴다
    // → 재고가 한쪽에만 쌓인다. 저장과 조회가 같은 규칙을 쓰는지 양쪽에서 고정한다.
    it('이메일을 소문자로 정규화해 저장한다', async () => {
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'kim@example.com',
        name: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await service.signup({ ...SIGNUP_INPUT, email: '  KIM@Example.COM  ' });

      expect(prisma.user.create.mock.calls[0][0].data.email).toBe('kim@example.com');
    });
  });

  describe('login', () => {
    it('없는 유저면 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'ghost@example.com', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('비번 불일치면 UnauthorizedException', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'bob@example.com',
        name: null,
        createdAt: new Date(),
        passwordHash,
      });
      await expect(
        service.login({ email: 'bob@example.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    // 소셜 전용 유저는 passwordHash 가 null 이다. 여기서 "비밀번호 없음"을 다른 에러로 흘리면
    // 응답만 보고 **"이 이메일은 카카오로 가입돼 있다"** 를 알아낼 수 있다(계정 열거).
    it('소셜 전용 유저(passwordHash=null)는 같은 에러로 거절한다', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'social@example.com',
        name: null,
        createdAt: new Date(),
        passwordHash: null,
      });
      await expect(
        service.login({ email: 'social@example.com', password: 'anything' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('일치하면 세션 발급', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'bob@example.com',
        name: '밥',
        createdAt: new Date(),
        passwordHash,
      });
      const res = await service.login({ email: 'bob@example.com', password: 'correct-horse' });
      expect(res.user.email).toBe('bob@example.com');
      expect(res.accessToken).toBe('access.jwt.token');
      expect(prisma.refreshSession.create).toHaveBeenCalledTimes(1);
    });

    // 저장 쪽(위 signup 스펙)과 짝이다 — 조회도 같은 규칙을 써야 대소문자만 다른 입력으로
    // 로그인이 실패하지 않는다.
    it('조회할 때도 이메일을 소문자로 정규화한다', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'bob@example.com',
        name: '밥',
        createdAt: new Date(),
        passwordHash,
      });
      await service.login({ email: '  BOB@Example.COM ', password: 'correct-horse' });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'bob@example.com' },
      });
    });
  });

  describe('refresh', () => {
    it('없는 refresh 세션이면 UnauthorizedException', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue(null);
      await expect(service.refresh('whatever')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('만료된 세션이면 정리하고 거절', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refresh('expired')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshSession.deleteMany).toHaveBeenCalledWith({ where: { id: 's1' } });
    });

    it('유효하면 회전: 옛 세션 삭제 + 새 세션 발급', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 100_000),
      });
      prisma.refreshSession.deleteMany.mockResolvedValue({ count: 1 });
      const res = await service.refresh('valid');
      expect(prisma.refreshSession.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.refreshSession.create).toHaveBeenCalledTimes(1);
      expect(res.accessToken).toBe('access.jwt.token');
      expect(res.refreshToken).toEqual(expect.any(String));
    });

    it('경합으로 이미 삭제됨(count 0)이면 재사용 거절 (500 아님)', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 100_000),
      });
      prisma.refreshSession.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.refresh('raced')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshSession.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('해당 refresh 세션을 deleteMany 로 폐기(멱등)', async () => {
      await service.logout('sometoken');
      expect(prisma.refreshSession.deleteMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentUser', () => {
    it('있으면 표시용 유저 반환', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'bob@example.com',
        name: '밥',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await expect(service.getCurrentUser('u1')).resolves.toEqual({
        id: 'u1',
        email: 'bob@example.com',
        name: '밥',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('없으면 NotFoundException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getCurrentUser('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
