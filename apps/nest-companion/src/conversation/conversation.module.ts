import { Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

/**
 * LlmModule(@Global), PrismaModule(@Global), ConfigModule(global)에서
 * LlmService/PrismaService/ConfigService 를 그대로 주입받는다.
 * 메모리 주입(recall)을 위해 MemoryModule 만 명시적으로 import 한다.
 */
@Module({
  imports: [MemoryModule],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
