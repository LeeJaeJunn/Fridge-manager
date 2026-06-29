import type { ChatMessageType, ChatResType, StructuredResType } from '@companion/types';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ZodType } from 'zod';
import { OPENAI_CLIENT } from './llm.constants';

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

  /**
   * 구조화(JSON) 출력 호출 — Structured Outputs 로 스키마에 맞는 객체를 강제한다.
   * 메모리 추출처럼 "정해진 모양의 데이터"가 필요한 작업에서 chat() 대신 쓴다.
   * 벤더(OpenAI) 세부는 여기 안에만 둔다.
   */
  async structured<T>(
    instructions: string,
    input: string,
    schema: ZodType<T>,
    schemaName: string,
    model: string,
  ): Promise<StructuredResType<T>> {
    try {
      const res = await this.client.responses.parse({
        model,
        instructions,
        input,
        text: { format: zodTextFormat(schema, schemaName) },
      });
      if (!res.output_parsed) {
        // 모델 거절·미완성 등으로 파싱 결과가 없는 경우
        throw new Error('구조화 출력이 비어 있습니다.');
      }
      return {
        id: res.id,
        model: res.model,
        status: res.status ?? 'failed',
        parsed: res.output_parsed, // zod 로 검증된 T (캐스팅 없음)
        usage: res.usage
          ? {
              inputTokens: res.usage.input_tokens,
              outputTokens: res.usage.output_tokens,
              totalTokens: res.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      this.logger.error(`구조화 LLM 호출 실패 (model=${model})`, err as Error);
      throw new ServiceUnavailableException('AI 처리에 실패했습니다.');
    }
  }

  /** 답변을 토큰 단위로 흘려보냄 (SSE 타이핑 효과용) */
  // async *stream(messages: ChatMessageType[], model: string): AsyncGenerator<string> {
  //   const stream = await this.client.responses.create({
  //     model,
  //     input: messages,
  //     stream: true,
  //   });
  //   // Responses API는 의미 단위 이벤트를 흘려보냄 — 텍스트 조각만 골라낸다
  //   for await (const event of stream) {
  //     if (event.type === 'response.output_text.delta') {
  //       yield event.delta;
  //     }
  //   }
  // }
}
