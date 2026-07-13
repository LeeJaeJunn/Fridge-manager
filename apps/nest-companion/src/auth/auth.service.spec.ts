import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

type CreateUserArg = { data: { loginId: string; passwordHash: string; name?: string | null } };

type PrismaMock = {
  user: { findUnique: jest.Mock; create: jest.Mock<Promise<unknown>, [CreateUserArg]> };
  refreshSession: {
    create: jest.Mock;
    findUnique: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('AuthService', () => {
  let prisma: PrismaMock;
  let jwt: { signAsync: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
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
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config,
    );
  });

  describe('signup', () => {
    it('unique 위반(P2002)이면 ConflictException', async () => {
      prisma.user.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.signup({ loginId: 'taken', password: 'password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('성공 시 비번을 해시로 저장하고 세션 토큰을 발급', async () => {
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        loginId: 'newbie',
        name: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const res = await service.signup({ loginId: 'newbie', password: 'password123' });

      const created = prisma.user.create.mock.calls[0][0];
      expect(created.data.loginId).toBe('newbie');
      expect(created.data.passwordHash).not.toBe('password123'); // 원문 저장 금지
      await expect(bcrypt.compare('password123', created.data.passwordHash)).resolves.toBe(true);

      expect(res.accessToken).toBe('access.jwt.token');
      expect(res.refreshToken).toEqual(expect.any(String));
      expect(res.user).toEqual({
        id: 'u1',
        loginId: 'newbie',
        name: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      expect(prisma.refreshSession.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('login', () => {
    it('없는 유저면 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ loginId: 'ghost', password: 'x' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('비번 불일치면 UnauthorizedException', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        loginId: 'bob',
        name: null,
        createdAt: new Date(),
        passwordHash,
      });
      await expect(service.login({ loginId: 'bob', password: 'wrong' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('일치하면 세션 발급', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        loginId: 'bob',
        name: '밥',
        createdAt: new Date(),
        passwordHash,
      });
      const res = await service.login({ loginId: 'bob', password: 'correct-horse' });
      expect(res.user.loginId).toBe('bob');
      expect(res.accessToken).toBe('access.jwt.token');
      expect(prisma.refreshSession.create).toHaveBeenCalledTimes(1);
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
});
