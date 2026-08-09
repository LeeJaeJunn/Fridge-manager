import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { MemoryModule } from '../memory/memory.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

/**
 * LlmModule(@Global), PrismaModule(@Global), ConfigModule(global)에서
 * LlmService/PrismaService/ConfigService 를 그대로 주입받는다.
 * 메모리 주입(recall)은 MemoryModule, 냉장고 재고 주입·툴은 InventoryModule 을 import 한다.
 * (레시피 검색 툴을 붙일 때 RecipeModule 이 여기 추가된다)
 */
@Module({
  imports: [MemoryModule, InventoryModule],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
