import type { ChatMessageType, ChatResType, StructuredResType } from '@companion/types';
import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';
import { GeminiLlmProvider } from './gemini-llm.service';
import type {
  LlmInputItemType,
  LlmProvider,
  LlmTool,
  LlmToolExecutor,
  ToolChatResType,
} from './llm-provider.interface';
import { OpenAiLlmProvider } from './openai-llm.service';

// 소비처(conversation/memory)는 계속 이 경로에서 타입을 import 하므로 그대로 재노출한다.
export type {
  LlmFunctionCallItemType,
  LlmFunctionOutputItemType,
  LlmInputItemType,
  LlmTextItemType,
  LlmTool,
  LlmToolExecutor,
  TerminalToolCall,
  ToolChatResType,
} from './llm-provider.interface';

/**
 * 앱 전체가 사용하는 LLM 진입점 — **벤더 라우터**다.
 * Chat / Memory / Recommendation 등은 이 서비스의 메서드만 호출하고, 내부에서 어떤 벤더를 쓰는지는 모른다.
 *
 * 모델은 호출하는 쪽에서 파라미터로 넘긴다. **모델 이름 하나가 벤더까지 결정**한다:
 * 'gemini' 로 시작하면 Gemini, 그 외(gpt/o 등)는 OpenAI. (별도 LLM_PROVIDER env 불필요)
 * 그래서 `LLM_MODEL=gemini-3.5-flash` 는 Gemini 로, `MEMORY_EXTRACT_MODEL=gpt-5-nano` 는 OpenAI 로 자동 분기된다.
 */
@Injectable()
export class LlmService {
  constructor(
    private readonly openai: OpenAiLlmProvider,
    private readonly gemini: GeminiLlmProvider,
  ) {}

  /** 모델 이름으로 벤더 구현을 고른다. */
  private pick(model: string): LlmProvider {
    return model.startsWith('gemini') ? this.gemini : this.openai;
  }

  chat(instructions: string, messages: ChatMessageType[], model: string): Promise<ChatResType> {
    return this.pick(model).chat(instructions, messages, model);
  }

  structured<T>(
    instructions: string,
    input: string,
    schema: ZodType<T>,
    schemaName: string,
    model: string,
  ): Promise<StructuredResType<T>> {
    return this.pick(model).structured<T>(instructions, input, schema, schemaName, model);
  }

  chatWithTools(
    instructions: string,
    items: LlmInputItemType[],
    tools: LlmTool[],
    executors: Record<string, LlmToolExecutor>,
    model: string,
    maxRounds = 3,
  ): Promise<ToolChatResType> {
    return this.pick(model).chatWithTools(instructions, items, tools, executors, model, maxRounds);
  }
}
