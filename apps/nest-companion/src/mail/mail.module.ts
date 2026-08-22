import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * @Global() — 지금은 인증 코드 발송만 쓰지만, 결제 영수증·구독 만료 안내 등 여러 도메인이
 * 같은 발송 계층을 쓰게 된다. `LlmModule`·`UsageModule` 과 같은 자리다.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
