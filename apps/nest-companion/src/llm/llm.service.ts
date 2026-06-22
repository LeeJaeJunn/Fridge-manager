import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import { OPENAI_CLIENT } from './llm.constants';
import { ChatMessageType, ChatResType } from '../contracts/chat.contract';

/**
 * 앱 전체가 사용하는 LLM 진입점.
 * Chat / Memory / Recommendation 등은 이 서비스의 메서드만 호출하고,
 * 내부에서 어떤 벤더(OpenAI)를 쓰는지는 몰라도 된다.
 *
 * 모델은 호출하는 쪽에서 파라미터로 넘긴다 (호출별로 다른 모델 사용 가능).
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(@Inject(OPENAI_CLIENT) private readonly client: OpenAI) {}

  /** 한 번의 요청 → 정리된 응답(ChatResType) 반환 */
  async chat(
    instructions: string,
    messages: ChatMessageType[],
    model: string,
  ): Promise<ChatResType> {
    try {
      const res = await this.client.responses.create({
        model,
        instructions,
        input: messages,
      });

      return {
        id: res.id,
        model: res.model,
        status: res.status ?? 'failed',
        text: res.output_text ?? '',
        usage: res.usage
          ? {
              inputTokens: res.usage.input_tokens,
              outputTokens: res.usage.output_tokens,
              totalTokens: res.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      this.logger.error(`LLM 호출 실패 (model=${model})`, err as Error);
      throw new ServiceUnavailableException('AI 응답 생성에 실패했습니다.');
    }
  }

  /** 답변을 토큰 단위로 흘려보냄 (SSE 타이핑 효과용) */
  async *stream(messages: ChatMessageType[], model: string): AsyncGenerator<string> {
    const stream = await this.client.responses.create({
      model,
      input: messages,
      stream: true,
    });
    // Responses API는 의미 단위 이벤트를 흘려보냄 — 텍스트 조각만 골라낸다
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        yield event.delta;
      }
    }
  }
}
