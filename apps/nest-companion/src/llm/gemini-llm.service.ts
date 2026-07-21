import type { ChatMessageType, ChatResType, StructuredResType } from '@companion/types';
import { GoogleGenAI } from '@google/genai';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { LlmProvider, LlmTool, LlmToolExecutor } from './llm-provider.interface';
import { GEMINI_CLIENT } from './llm.constants';

/** interactions.usage → 벤더 중립 usage(LlmUsageType) 변환용 (snake_case). */
type InteractionUsage = {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_tokens?: number;
};

/**
 * Gemini(Google GenAI) 벤더 구현.
 * LlmService(라우터)가 모델 이름이 'gemini' 로 시작할 때 이 provider 로 위임한다.
 * OpenAiLlmProvider 와 **같은 3메서드 계약**(chat/structured/chatWithTools)을 갖는다.
 *
 * `@google/genai` 세부는 여기 안에만 둔다. 채팅·툴 호출은 **Interactions API**(`interactions.create`,
 * OpenAI Responses 를 본뜬 최신 인터페이스)로 구현한다. 필드는 snake_case(system_instruction 등).
 * 툴 루프는 `previous_interaction_id`(서버측 상태)로 이어간다 — 문서 권장 방식.
 */
@Injectable()
export class GeminiLlmProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiLlmProvider.name);

  constructor(@Inject(GEMINI_CLIENT) private readonly client: GoogleGenAI) {}

  /** ChatMessageType[] → interactions input steps (assistant → 'model_output', user → 'user_input'). */
  private toInput(messages: ChatMessageType[]) {
    return messages.map((m) => ({
      type: m.role === 'assistant' ? ('model_output' as const) : ('user_input' as const),
      content: [{ type: 'text' as const, text: m.content }],
    }));
  }

  private toUsage(u: InteractionUsage | undefined): ChatResType['usage'] {
    if (!u) return undefined;
    return {
      inputTokens: u.total_input_tokens ?? 0,
      outputTokens: u.total_output_tokens ?? 0,
      totalTokens: u.total_tokens ?? 0,
    };
  }

  /** 한 번의 요청 → 정리된 응답(ChatResType). instructions 는 system_instruction 으로 들어간다. */
  async chat(
    instructions: string,
    messages: ChatMessageType[],
    model: string,
  ): Promise<ChatResType> {
    try {
      const interaction = await this.client.interactions.create({
        model,
        input: this.toInput(messages),
        system_instruction: instructions,
        store: false, // 히스토리는 우리(DB)가 관리 — 서버측 상태 불필요
      });
      return {
        id: interaction.id,
        model,
        status: 'completed',
        text: interaction.output_text ?? '',
        usage: this.toUsage(interaction.usage),
      };
    } catch (err) {
      this.logger.error(`Gemini 호출 실패 (model=${model})`, err as Error);
      throw new ServiceUnavailableException('AI 응답 생성에 실패했습니다.');
    }
  }

  /**
   * 구조화 출력 — 아직 Gemini 로 라우팅하지 않는다 (메모리 추출은 OpenAI 모델을 쓴다).
   * 나중에 response_format 으로 구현. 현재 라우터는 이 경로로 오지 않는다.
   */
  structured<T>(): Promise<StructuredResType<T>> {
    return Promise.reject(
      new ServiceUnavailableException('구조화 출력은 아직 Gemini 에서 지원하지 않습니다.'),
    );
  }

  /**
   * 툴(function calling) 대화. 모델이 function_call step 을 내면 → 실행기로 실행 →
   * function_result 로 재주입(previous_interaction_id 로 이어감) → 최종 텍스트. (openai chatWithTools 와 동형)
   */
  async chatWithTools(
    instructions: string,
    messages: ChatMessageType[],
    tools: LlmTool[],
    executors: Record<string, LlmToolExecutor>,
    model: string,
    maxRounds = 3,
  ): Promise<ChatResType> {
    try {
      // interactions 툴 선언: { type:'function', name, description, parameters(JSON Schema) }
      const toolDefs = tools.map((t) => ({
        type: 'function' as const,
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      // 여러 왕복의 토큰을 누적한다 (마지막 호출만이 아니라 총합)
      let inputTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;
      let sawUsage = false;
      const accumulate = (u: InteractionUsage | undefined) => {
        if (!u) return;
        sawUsage = true;
        inputTokens += u.total_input_tokens ?? 0;
        outputTokens += u.total_output_tokens ?? 0;
        totalTokens += u.total_tokens ?? 0;
      };

      // 첫 호출: 전체 히스토리 + 툴. store:true 여야 이후 previous_interaction_id 로 이어갈 수 있다.
      let interaction = await this.client.interactions.create({
        model,
        input: this.toInput(messages),
        system_instruction: instructions,
        tools: toolDefs,
        store: true,
        generation_config: {
          thinking_level: 'minimal',
        },
      });
      accumulate(interaction.usage);

      // 모델이 툴을 더 안 부를 때까지(또는 상한까지) 반복
      for (let round = 0; round < maxRounds; round++) {
        // function_call step 만 골라낸다 (discriminated union 을 if 로 좁힘).
        const calls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
        for (const step of interaction.steps ?? []) {
          if (step.type === 'function_call') {
            calls.push({
              id: step.id,
              name: step.name,
              args: step.arguments ?? {},
            });
          }
        }
        if (calls.length === 0) break;

        // 각 툴 실행 → function_result 입력 구성 (result 는 문자열 허용).
        const resultInputs: Array<{
          type: 'function_result';
          call_id: string;
          name: string;
          result: string;
        }> = [];
        for (const call of calls) {
          let result: unknown;
          try {
            const executor = executors[call.name];
            result = executor ? await executor(call.args) : { error: `unknown tool: ${call.name}` };
          } catch (e) {
            this.logger.error(`툴 실행 실패 (${call.name})`, e as Error);
            result = { error: '도구 실행에 실패했습니다.' };
          }
          resultInputs.push({
            type: 'function_result',
            call_id: call.id,
            name: call.name,
            result: JSON.stringify(result),
          });
        }

        // 마지막 라운드엔 tool_choice:'none' 으로 툴을 막아 반드시 텍스트 답을 받는다.
        const lastRound = round === maxRounds - 1;
        interaction = await this.client.interactions.create({
          model,
          previous_interaction_id: interaction.id, // 서버가 앞선 맥락을 이어감
          input: resultInputs,
          tools: toolDefs,
          store: true,
          // 마지막 라운드엔 tool_choice:'none' 을 같은 generation_config 안에 병합한다.
          // (별도 키로 스프레드하면 generation_config 가 통째로 덮여 thinking_level 이 날아간다)
          generation_config: {
            thinking_level: 'minimal',
            ...(lastRound ? { tool_choice: 'none' } : {}),
          },
        });
        accumulate(interaction.usage);
      }

      return {
        id: interaction.id,
        model,
        status: 'completed',
        text: interaction.output_text ?? '',
        usage: sawUsage ? { inputTokens, outputTokens, totalTokens } : undefined,
      };
    } catch (err) {
      this.logger.error(`Gemini 툴 대화 실패 (model=${model})`, err as Error);
      throw new ServiceUnavailableException('AI 응답 생성에 실패했습니다.');
    }
  }
}
