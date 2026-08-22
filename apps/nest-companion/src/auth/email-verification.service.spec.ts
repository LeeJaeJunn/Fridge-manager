import { createHash } from 'node:crypto';
import { BadRequestException, HttpException } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmailVerificationService,
  PURPOSE_SIGNUP,
  VERIFICATION,
} from './email-verification.service';

/**
 * 여기 고정하는 건 전부 **손으로 재현하기 어렵거나 실패해도 눈에 안 보이는 것**들이다
 * (AGENTS.md 의 스펙 기준). 특히 `failCount` 는 `@nestjs/throttler` 가 붙기 전까지
 * 6자리 코드에 대한 **유일한 무차별 대입 방어**라, 조용히 깨지면 인증이 뚫린다.
 */

type QueryMock = jest.Mock<Promise<unknown>, [unknown]>;
type PrismaMock = {
  emailVerification: {
    create: QueryMock;
    findFirst: QueryMock;
    findMany: QueryMock;
    update: QueryMock;
    deleteMany: QueryMock;
  };
};

const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);

/** 아직 안 쓴 정상 코드 행 */
const pendingRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'v1',
  email: 'kim@example.com',
  purpose: PURPOSE_SIGNUP,
  codeHash: sha256('123456'),
  expiresAt: minutesFromNow(5),
  verifiedAt: null,
  failCount: 0,
  tokenHash: null,
  createdAt: new Date(),
  ...over,
});

function setup() {
  const prisma: PrismaMock = {
    emailVerification: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ failCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  // 인자를 명시해 둔다 — 기본 jest.Mock 은 calls 가 any 라 lint 가 막는다(레포의 QueryMock 과 같은 이유).
  const mail = {
    send: jest.fn<Promise<void>, [string, string, string]>().mockResolvedValue(undefined),
  };
  const service = new EmailVerificationService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
  );
  return { prisma, mail, service };
}

const createArg = (prisma: PrismaMock) =>
  prisma.emailVerification.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };

describe('sendCode', () => {
  it('코드를 해시로만 저장하고 메일로 보낸다', async () => {
    const { prisma, mail, service } = setup();
    const res = await service.sendCode('kim@example.com', PURPOSE_SIGNUP);

    const body = mail.send.mock.calls[0][2];
    const code = /(\d{6})/.exec(body)?.[1] ?? '';
    expect(code).toHaveLength(VERIFICATION.codeDigits);
    // 원문이 아니라 해시가 저장돼야 한다 (DB 유출 시 코드 복원 방지 — refresh 토큰과 같은 방식)
    expect(createArg(prisma).data.codeHash).toBe(sha256(code));
    expect(createArg(prisma).data.codeHash).not.toBe(code);

    // 앱이 카운트다운을 그리려면 서버가 숫자를 내려줘야 한다 (앱 하드코딩 금지)
    expect(res).toEqual({
      retryAfterSec: VERIFICATION.resendCooldownSec,
      expiresInSec: VERIFICATION.ttlMinutes * 60,
    });
  });

  it('쿨다운 안에 다시 요청하면 429', async () => {
    const { prisma, mail, service } = setup();
    // 방금(1초 전) 보낸 이력
    prisma.emailVerification.findMany.mockResolvedValue([
      { createdAt: new Date(Date.now() - 1000) },
    ]);

    await expect(service.sendCode('kim@example.com', PURPOSE_SIGNUP)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(mail.send).not.toHaveBeenCalled(); // 메일도 안 나가야 한다
  });

  it('시간당 상한을 넘으면 429 — 61초마다 눌러 하루 한도를 태우는 걸 막는다', async () => {
    const { prisma, mail, service } = setup();
    // 쿨다운은 지났지만(2분 전) 1시간 안에 상한만큼 쌓인 상태
    const old = new Date(Date.now() - 120_000);
    prisma.emailVerification.findMany.mockResolvedValue(
      Array.from({ length: VERIFICATION.maxPerHour }, () => ({ createdAt: old })),
    );

    await expect(service.sendCode('kim@example.com', PURPOSE_SIGNUP)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe('verifyCode', () => {
  it('맞으면 증표를 발급하고 원문이 아니라 해시를 저장한다', async () => {
    const { prisma, service } = setup();
    prisma.emailVerification.findFirst.mockResolvedValue(pendingRow());

    const { verificationToken } = await service.verifyCode(
      'kim@example.com',
      PURPOSE_SIGNUP,
      '123456',
    );

    const arg = prisma.emailVerification.update.mock.calls[0][0] as {
      data: { verifiedAt: Date; tokenHash: string };
    };
    expect(arg.data.verifiedAt).toBeInstanceOf(Date);
    expect(arg.data.tokenHash).toBe(sha256(verificationToken));
  });

  it('틀리면 failCount 를 올린다', async () => {
    const { prisma, service } = setup();
    prisma.emailVerification.findFirst.mockResolvedValue(pendingRow());

    await expect(
      service.verifyCode('kim@example.com', PURPOSE_SIGNUP, '000000'),
    ).rejects.toBeInstanceOf(BadRequestException);

    const arg = prisma.emailVerification.update.mock.calls[0][0] as {
      data: { failCount: { increment: number } };
    };
    expect(arg.data.failCount).toEqual({ increment: 1 });
  });

  // ⚠️ 이게 깨지면 6자리 코드가 무제한 시도로 뚫린다. 손으로 재현하려면 6번 요청해야 한다.
  it('실패 상한에 도달하면 맞는 코드라도 거절한다', async () => {
    const { prisma, service } = setup();
    prisma.emailVerification.findFirst.mockResolvedValue(
      pendingRow({ failCount: VERIFICATION.maxFail }),
    );

    await expect(
      service.verifyCode('kim@example.com', PURPOSE_SIGNUP, '123456'), // 맞는 코드
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.emailVerification.update).not.toHaveBeenCalled();
  });

  it('만료된 코드는 맞아도 거절한다', async () => {
    const { prisma, service } = setup();
    prisma.emailVerification.findFirst.mockResolvedValue(
      pendingRow({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      service.verifyCode('kim@example.com', PURPOSE_SIGNUP, '123456'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('이미 인증된 코드는 재사용할 수 없다', async () => {
    const { prisma, service } = setup();
    prisma.emailVerification.findFirst.mockResolvedValue(pendingRow({ verifiedAt: new Date() }));

    await expect(
      service.verifyCode('kim@example.com', PURPOSE_SIGNUP, '123456'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('assertVerified', () => {
  // ⚠️ 여기가 뚫리면 **코드를 못 본 제3자가 가입**할 수 있다.
  it('증표가 안 맞으면 거절한다', async () => {
    const { prisma, service } = setup();
    prisma.emailVerification.findFirst.mockResolvedValue(null); // tokenHash 로 못 찾음

    await expect(
      service.assertVerified('kim@example.com', PURPOSE_SIGNUP, 'wrong-token'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('증표로 조회할 때 해시로 찾는다 (원문이 DB 에 없다)', async () => {
    const { prisma, service } = setup();
    prisma.emailVerification.findFirst.mockResolvedValue({ verifiedAt: new Date() });

    await service.assertVerified('kim@example.com', PURPOSE_SIGNUP, 'tok');

    const arg = prisma.emailVerification.findFirst.mock.calls[0][0] as {
      where: { tokenHash: string };
    };
    expect(arg.where.tokenHash).toBe(sha256('tok'));
  });

  it('인증한 지 오래되면 거절한다', async () => {
    const { prisma, service } = setup();
    const stale = new Date(Date.now() - (VERIFICATION.tokenTtlMinutes + 1) * 60_000);
    prisma.emailVerification.findFirst.mockResolvedValue({ verifiedAt: stale });

    await expect(
      service.assertVerified('kim@example.com', PURPOSE_SIGNUP, 'tok'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // 지금 시각이 아니라 **실제로 코드를 맞춘 시각**이 User.emailVerified 에 들어가야 한다.
  it('통과하면 verifiedAt 을 그대로 돌려준다', async () => {
    const { prisma, service } = setup();
    const verifiedAt = new Date(Date.now() - 60_000);
    prisma.emailVerification.findFirst.mockResolvedValue({ verifiedAt });

    await expect(service.assertVerified('kim@example.com', PURPOSE_SIGNUP, 'tok')).resolves.toEqual(
      verifiedAt,
    );
  });
});
