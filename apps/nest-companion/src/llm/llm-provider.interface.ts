import type { ChatMessageType, ChatResType, StructuredResType } from '@companion/types';
import type { ZodType } from 'zod';

/** 벤더 중립 툴 정의 — 호출자(Conversation 등)가 벤더 타입을 모르게 한다. parameters 는 JSON Schema. */
export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** 툴 실행기 — LLM 이 준 인자(JSON)를 받아 결과를 반환. 결과는 직렬화돼 모델에 재주입된다. */
export type LlmToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * 한 LLM 벤더의 구현 계약. OpenAiLlmProvider / GeminiLlmProvider 가 이걸 구현하고,
 * LlmService(라우터)가 모델 이름으로 골라 위임한다. 세 메서드는 전부 벤더 중립 타입만 주고받는다.
 */
export interface LlmProvider {
  /** 한 번의 요청 → 정리된 응답 */
  chat(instructions: string, messages: ChatMessageType[], model: string): Promise<ChatResType>;

  /** 구조화(JSON) 출력 — zod 스키마에 맞는 검증된 객체 강제 */
  structured<T>(
    instructions: string,
    input: string,
    schema: ZodType<T>,
    schemaName: string,
    model: string,
  ): Promise<StructuredResType<T>>;

  /** 툴(function calling) 대화 — 모델이 툴을 부르면 실행기로 실행해 재주입, 최종 텍스트 반환 */
  chatWithTools(
    instructions: string,
    messages: ChatMessageType[],
    tools: LlmTool[],
    executors: Record<string, LlmToolExecutor>,
    model: string,
    maxRounds?: number,
  ): Promise<ChatResType>;
}
