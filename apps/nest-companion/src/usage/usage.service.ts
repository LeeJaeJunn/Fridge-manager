import type { LlmUsageType } from '@companion/types';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 어느 기능이 태운 토큰인지 — 원가를 기능별로 가르는 축.
 * DB 는 String 이라 값을 강제하지 못하므로, 늘릴 땐 `LlmUsage.feature` 주석도 함께 고친다.
 */
export type UsageFeatureType = 'chat' | 'memory_extract' | 'scan' | 'consume_calc';

/**
 * LLM 호출 1건이 "누구를 위한 것인지" — `LlmService` 의 세 메서드가 전부 **필수로** 받는다.
 *
 * **필수인 게 요점이다.** 기록을 빠뜨리는 실패는 조용하다 — create 를 안 붙여도 아무것도 안
 * 깨지고 채팅은 잘 돌며 원장만 소리 없이 빈다. 그리고 몇 달 뒤 원가를 보려는 순간에야 알게
 * 되는데 그땐 backfill 이 불가능하다. 그래서 새 호출 지점에서 컴파일러가 이 값을 요구하게 해
 * `billable` 판단을 반드시 한 번 하도록 만든다.
 */
export type UsageContextType = {
  /** 이 호출의 수혜자. 유저 밖에서 도는 호출(어드민·배치)이 생기면 null. */
  userId: string | null;
  feature: UsageFeatureType;
  /** 디버깅용 참조 — 대화 밖(스캔 등)이면 생략. FK 가 아니라 대화가 지워져도 안 깨진다. */
  conversationId?: string;
  /**
   * 유저 쿼터에 셀지. **원가(전부)와 쿼터(유저가 시킨 것만)는 다른 질문**이라 갈린다.
   *
   * `false` 로 둘 것:
   *  - 백그라운드 메모리 추출 — 유저가 시킨 적이 없다. 여기서 깎으면 `MEMORY_EXTRACT_EVERY_N`
   *    을 6→3 으로 튜닝하는 순간 **모든 유저의 한도가 조용히 줄어든다**(서버 노브가 요금제를 바꾼다).
   *  - 우리 쪽 오류로 인한 재호출 — 유저 탓이 아니다.
   */
  billable: boolean;
};

/**
 * LLM 호출 원장 — 호출 1건 = 행 1개, append-only.
 *
 * 지금은 **계측만** 한다(제한 없음). 구독제를 붙일 때 무료 한도를 얼마로 둘지는 추측이 아니라
 * 이 데이터의 분포를 보고 정한다 — 한도는 올리긴 쉽고 내리긴 최악이라 먼저 재고 나중에 막는다.
 *
 * 쓰기는 `LlmService` 한 곳에서만 들어온다(호출자가 직접 부르지 않는다). 읽기 쪽(쿼터 검사·
 * `GET /usage/me`·어드민 집계)이 곧 여기 메서드로 붙는데, 쓰기를 호출자 3곳에 흩어놓고
 * 읽기만 모으면 양쪽 다 나쁜 조합이 되므로 처음부터 한집에 둔다.
 *
 * ⚠️ **집계 테이블(카운터)을 미리 만들지 않는다.** 원장과 카운터 두 기록이 어긋나는 고전적
 * 버그를 떠안게 되고("상태를 따로 들고 있으면 두 기록이 어긋난다" — 재고 확인 카드와 같은 판단),
 * 유저 한 명이 한 달에 쌓는 행은 수백 개 규모라 `@@index([userId, createdAt])` 위 집계로 충분하다.
 * 진짜 아파지면 그때 `UsageCounter(userId, period)` 를 캐시로 얹는다 — 원장이 있으면 언제든
 * 파생시켜 채울 수 있지만(backfill 가능) 반대는 안 된다.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 호출 1건 기록 — **fire-and-forget 이고 실패해도 삼킨다.**
   *
   * "에러 처리" 원칙(try-catch 로 감싸지 않는다)의 **의도적 예외**다. 회계 기록이 실패했다고
   * 사용자의 채팅이 죽으면 안 되고, DB 왕복 때문에 응답이 느려져서도 안 된다
   * (메모리 추출을 백그라운드로 둔 것과 같은 판단).
   *
   * `usage` 가 없으면(벤더가 안 줬거나 호출이 실패했으면) 아무것도 쓰지 않는다.
   * ⚠️ 그래서 **실패한 호출이 태운 토큰은 원장에 안 잡힌다** — 원장이 실제 청구서보다 조금
   * 작게 나오는 이유가 여기다. 지금은 감수하고, 어긋남이 커지면 실패 경로도 기록한다.
   *
   * `model` 은 요청한 이름이 아니라 **벤더가 실제로 썼다고 답한 값**을 받는다(별칭이 구체 버전으로
   * 해석될 수 있어서, 나중에 단가를 곱하려면 실제 모델이어야 한다).
   */
  record(ctx: UsageContextType, model: string, usage: LlmUsageType | undefined): void {
    if (!usage) return;
    void this.prisma.llmUsage
      .create({
        data: {
          userId: ctx.userId,
          conversationId: ctx.conversationId ?? null,
          feature: ctx.feature,
          model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          billable: ctx.billable,
        },
      })
      .catch((err: unknown) => {
        this.logger.error(`사용량 기록 실패 (feature=${ctx.feature})`, err as Error);
      });
  }
}
