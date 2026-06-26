import { Module } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

/**
 * LlmModule(@Global), PrismaModule(@Global), ConfigModule(global)에서
 * LlmService/PrismaService/ConfigService 를 그대로 주입받으므로 별도 import 불필요.
 */
@Module({
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
