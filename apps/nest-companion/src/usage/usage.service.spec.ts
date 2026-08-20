import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService, type UsageContextType } from './usage.service';

/**
 * 사용량 기록은 **fire-and-forget 이고 실패를 삼킨다** — 즉 안 돌아도 아무것도 안 깨진다.
 * 정확히 그래서 스펙으로 고정한다(AGENTS.md: "실패해도 눈에 안 보이는 것만 고정한다").
 * 여기가 비면 몇 달 뒤 원가를 보려는 순간에야 알게 되고, 그땐 backfill 이 불가능하다.
 */

/** 인자를 unknown 으로 고정 — 기본 jest.Mock 은 calls 가 any 라 lint 가 막는다. */
type QueryMock = jest.Mock<Promise<unknown>, [unknown]>;
type PrismaMock = { llmUsage: { create: QueryMock } };

type CreateArgs = {
  data: {
    userId: string | null;
    conversationId: string | null;
    feature: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    billable: boolean;
  };
};

const TOKENS = { inputTokens: 100, outputTokens: 20, totalTokens: 120 };

const CHAT_CTX: UsageContextType = {
  userId: 'u1',
  feature: 'chat',
  conversationId: 'c1',
  billable: true,
};

function setup() {
  const prisma: PrismaMock = { llmUsage: { create: jest.fn().mockResolvedValue({}) } };
  const service = new UsageService(prisma as unknown as PrismaService);
  return { prisma, service };
}

/** mock 에 넘어간 create 인자를 타입을 좁혀 꺼낸다 (calls 가 any 라 그대로 쓰면 lint 가 막는다). */
const createArg = (prisma: PrismaMock): CreateArgs =>
  prisma.llmUsage.create.mock.calls[0]?.[0] as CreateArgs;

/** fire-and-forget 이라 record() 는 즉시 반환한다 — 마이크로태스크를 한 번 흘려보내야 확인된다. */
const flush = () => new Promise((r) => setImmediate(r));

describe('UsageService.record', () => {
  it('토큰과 컨텍스트를 원장에 그대로 남긴다', async () => {
    const { prisma, service } = setup();
    service.record(CHAT_CTX, 'gpt-5.4-nano', TOKENS);
    await flush();

    expect(prisma.llmUsage.create).toHaveBeenCalledTimes(1);
    expect(createArg(prisma).data).toEqual({
      userId: 'u1',
      conversationId: 'c1',
      feature: 'chat',
      // 요청한 이름이 아니라 벤더가 실제로 썼다고 답한 값이 들어와야 한다(단가 계산의 근거).
      model: 'gpt-5.4-nano',
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      billable: true,
    });
  });

  it('billable: false 를 그대로 저장한다 — 원가엔 남기고 쿼터에서만 뺀다', async () => {
    const { prisma, service } = setup();
    // 백그라운드 메모리 추출. 여기서 행을 아예 안 쓰면 원가가 실제보다 작게 보인다.
    service.record(
      { userId: 'u1', feature: 'memory_extract', conversationId: 'c1', billable: false },
      'gpt-5.4-nano',
      TOKENS,
    );
    await flush();

    expect(prisma.llmUsage.create).toHaveBeenCalledTimes(1);
    expect(createArg(prisma).data.billable).toBe(false);
    expect(createArg(prisma).data.feature).toBe('memory_extract');
  });

  it('대화 밖(스캔)이면 conversationId 를 null 로 채운다', async () => {
    const { prisma, service } = setup();
    service.record({ userId: 'u1', feature: 'scan', billable: true }, 'gpt-5.4-nano', TOKENS);
    await flush();

    expect(createArg(prisma).data.conversationId).toBeNull();
  });

  it('벤더가 usage 를 안 주면 아무것도 쓰지 않는다', async () => {
    const { prisma, service } = setup();
    service.record(CHAT_CTX, 'gpt-5.4-nano', undefined);
    await flush();

    expect(prisma.llmUsage.create).not.toHaveBeenCalled();
  });

  it('DB 쓰기가 실패해도 던지지 않는다 — 회계 기록 때문에 채팅이 죽으면 안 된다', async () => {
    const { prisma, service } = setup();
    prisma.llmUsage.create.mockRejectedValue(new Error('db down'));
    // 삼키는 경로가 정상 동작이라 로그가 찍힌다 — 스택 트레이스로 CI 출력을 어지럽히지 않게 막는다.
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // 동기 throw 도, 미처리 rejection 도 없어야 한다.
    expect(() => service.record(CHAT_CTX, 'gpt-5.4-nano', TOKENS)).not.toThrow();
    await flush();
    expect(prisma.llmUsage.create).toHaveBeenCalledTimes(1);
    // 조용히 삼키기만 하면 안 된다 — 기록이 새는 걸 알 방법이 로그뿐이다.
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
