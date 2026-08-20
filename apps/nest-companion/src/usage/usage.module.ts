import { Global, Module } from '@nestjs/common';
import { UsageService } from './usage.service';

/**
 * @Global() — `LlmModule`(역시 전역)이 주입받고, 나중에 쿼터 가드도 어디서든 쓴다.
 * LLM 호출이 앱 전반에 퍼져 있으니 그 원장도 같은 자리에 둔다.
 *
 * ⚠️ `AppModule` 에서 `LlmModule` **앞에** 둔다 — 전역 모듈이라 순서에 안 걸리는 게 맞지만,
 * 읽는 사람에게 의존 방향(llm → usage)을 보여주려는 것이다.
 */
@Global()
@Module({
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
