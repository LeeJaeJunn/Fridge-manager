import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/**
 * LlmModule이 @Global()이라 LlmService는 import 없이 주입된다.
 */
@Module({
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
