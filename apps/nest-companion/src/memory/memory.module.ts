import { Module } from '@nestjs/common';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';

/**
 * LlmModule(@Global)·PrismaModule(@Global)·ConfigModule(global)·AuthModule(전역 export)에서
 * 필요한 의존을 그대로 주입받는다.
 * MemoryService 는 ConversationModule 이 주입해 쓰므로 export 한다 (연결은 다음 단계).
 */
@Module({
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
