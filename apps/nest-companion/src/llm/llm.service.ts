import type { ChatMessageType, ChatResType, StructuredResType } from '@companion/types';
import { Injectable } from '@nestjs/common';
import { UsageService, type UsageContextType } from '../usage/usage.service';
import { GeminiLlmProvider } from './gemini-llm.service';
import type {
  LlmInputItemType,
  LlmProvider,
  LlmTool,
  LlmToolExecutor,
  StructuredReqType,
  ToolChatResType,
} from './llm-provider.interface';
import { OpenAiLlmProvider } from './openai-llm.service';

// 소비처(conversation/memory)는 계속 이 경로에서 타입을 import 하므로 그대로 재노출한다.
export type {
  LlmFunctionCallItemType,
  LlmFunctionOutputItemType,
  LlmImageType,
  LlmInputItemType,
  LlmTextItemType,
  LlmTool,
  LlmToolExecutor,
  StructuredReqType,
  TerminalToolCall,
  ToolChatResType,
} from './llm-provider.interface';

// 호출자는 세 메서드에 usage 컨텍스트를 넘겨야 하므로 여기서 함께 재노출한다
// (타입 하나 때문에 usage/ 를 따로 import 하게 만들지 않는다).
export type { UsageContextType, UsageFeatureType } from '../usage/usage.service';

/**
 * 앱 전체가 사용하는 LLM 진입점 — **벤더 라우터 + 사용량 기록 지점**이다.
 * Chat / Memory / Scan 등은 이 서비스의 메서드만 호출하고, 내부에서 어떤 벤더를 쓰는지는 모른다.
 *
 * 모델은 호출하는 쪽에서 파라미터로 넘긴다. **모델 이름 하나가 벤더까지 결정**한다:
 * 'gemini' 로 시작하면 Gemini, 그 외(gpt/o 등)는 OpenAI. (별도 LLM_PROVIDER env 불필요)
 * 그래서 `LLM_MODEL=gemini-3.5-flash` 는 Gemini 로, `MEMORY_EXTRACT_MODEL=gpt-5-nano` 는 OpenAI 로 자동 분기된다.
 *
 * **원장 기록을 여기서 하는 이유**: "모든 LLM 호출은 `LlmService` 를 통한다"가 이미 레포 규칙이라,
 * 여기 두면 **커버리지가 구조로 보장된다**. 호출자가 각자 기록하면 create 모양이 3벌로 복제되고,
 * 무엇보다 네 번째 호출 지점에서 빠뜨려도 아무것도 안 깨져 조용히 원장만 빈다.
 * 그래서 `usage` 컨텍스트는 **필수 인자**다 — 컴파일러가 `billable` 판단을 강제한다.
 *
 * 쓰기는 `UsageService` 가 소유한다(`llm/` 이 DB·영속성을 모르게 유지 — 벤더 격리와 같은 이유).
 */
@Injectable()
export class LlmService {
  constructor(
    private readonly openai: OpenAiLlmProvider,
    private readonly gemini: GeminiLlmProvider,
    private readonly usage: UsageService,
  ) {}

  /** 모델 이름으로 벤더 구현을 고른다. */
  private pick(model: string): LlmProvider {
    return model.startsWith('gemini') ? this.gemini : this.openai;
  }

  /**
   * 응답에서 사용량을 원장에 남기고 응답을 그대로 돌려준다.
   * `res.model`(벤더가 실제로 썼다고 답한 값)을 쓴다 — 별칭이 구체 버전으로 해석될 수 있어서,
   * 나중에 단가를 곱하려면 요청한 이름이 아니라 이 값이어야 한다.
   */
  private meter<T extends ChatResType | StructuredResType<unknown>>(
    res: T,
    ctx: UsageContextType,
  ): T {
    this.usage.record(ctx, res.model, res.usage);
    return res;
  }

  async chat(
    instructions: string,
    messages: ChatMessageType[],
    model: string,
    usage: UsageContextType,
  ): Promise<ChatResType> {
    return this.meter(await this.pick(model).chat(instructions, messages, model), usage);
  }

  async structured<T>(
    req: StructuredReqType<T>,
    usage: UsageContextType,
  ): Promise<StructuredResType<T>> {
    return this.meter(await this.pick(req.model).structured<T>(req), usage);
  }

  async chatWithTools(
    instructions: string,
    items: LlmInputItemType[],
    tools: LlmTool[],
    executors: Record<string, LlmToolExecutor>,
    model: string,
    usage: UsageContextType,
    maxRounds = 3,
  ): Promise<ToolChatResType> {
    // chatWithTools 의 usage 는 provider 가 **모든 왕복을 누적**한 값이라 행 하나로 충분하다.
    return this.meter(
      await this.pick(model).chatWithTools(instructions, items, tools, executors, model, maxRounds),
      usage,
    );
  }
}
