import type { ChatMessageType, ChatResType, StructuredResType } from '@companion/types';
import type { ZodType } from 'zod';

/** 벤더 중립 툴 정의 — 호출자(Conversation 등)가 벤더 타입을 모르게 한다. parameters 는 JSON Schema. */
export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /**
   * 종결 툴 — 모델이 이 툴을 부르면 실행·재호출하지 않고 그 호출을 그대로 상위로 올린다(루프 중단).
   * 실제 처리(확인 카드 등)를 호출자가 하고 싶을 때. false/미지정이면 executors 로 실행하고 결과를 재주입한다.
   */
  terminal?: boolean;
}

/** 툴 실행기 — LLM 이 준 인자(JSON)를 받아 결과를 반환. 결과는 직렬화돼 모델에 재주입된다. */
export type LlmToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

/** 종결 툴 호출 한 건 — 실행하지 않고 상위로 올린 모델의 함수 호출(이름 + 파싱된 인자). */
export interface TerminalToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * `chatWithTools` 반환 — 일반 텍스트 응답에 더해, 종결 툴이 불렸으면 그 호출들을 담는다.
 * `terminalCalls` 가 있으면 모델은 텍스트를 내지 않았고(루프 중단), 호출자가 그 호출로 처리를 이어간다.
 */
export type ToolChatResType = ChatResType & { terminalCalls?: TerminalToolCall[] };

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

  /**
   * 툴(function calling) 대화 — 모델이 툴을 부르면 실행기로 실행해 재주입, 최종 텍스트 반환.
   * 단 `terminal` 툴을 부르면 실행하지 않고 `terminalCalls` 로 올려 루프를 끊는다.
   */
  chatWithTools(
    instructions: string,
    messages: ChatMessageType[],
    tools: LlmTool[],
    executors: Record<string, LlmToolExecutor>,
    model: string,
    maxRounds?: number,
  ): Promise<ToolChatResType>;
}
