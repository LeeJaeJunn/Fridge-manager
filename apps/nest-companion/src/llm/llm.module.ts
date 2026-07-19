import { Global, Module } from '@nestjs/common';
import { GeminiLlmProvider } from './gemini-llm.service';
import { GeminiProvider } from './gemini.provider';
import { LlmService } from './llm.service';
import { OpenAiLlmProvider } from './openai-llm.service';
import { OpenAiProvider } from './openai.provider';

/**
 * @Global() — Chat / Memory 등 어느 모듈에서든 import 없이 LlmService 주입 가능.
 * LLM 호출이 앱 전반에 퍼져 있으므로 전역으로 둔다.
 *
 * 벤더 클라이언트(OpenAiProvider/GeminiProvider) + 벤더 구현(OpenAiLlmProvider/GeminiLlmProvider)을
 * 등록하고, LlmService(라우터)가 모델 이름으로 골라 위임한다.
 */
@Global()
@Module({
  providers: [OpenAiProvider, GeminiProvider, OpenAiLlmProvider, GeminiLlmProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
