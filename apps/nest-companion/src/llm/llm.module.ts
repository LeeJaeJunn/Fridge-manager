import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { OpenAiProvider } from './openai.provider';

/**
 * @Global() — Chat / Memory 등 어느 모듈에서든 import 없이 LlmService 주입 가능.
 * LLM 호출이 앱 전반에 퍼져 있으므로 전역으로 둔다.
 */
@Global()
@Module({
  providers: [OpenAiProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
