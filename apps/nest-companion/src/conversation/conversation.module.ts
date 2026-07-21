import { Module } from '@nestjs/common';
import { CommerceModule } from '../commerce/commerce.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MemoryModule } from '../memory/memory.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

/**
 * LlmModule(@Global), PrismaModule(@Global), ConfigModule(global)에서
 * LlmService/PrismaService/ConfigService 를 그대로 주입받는다.
 * 메모리 주입(recall)은 MemoryModule, 냉장고 재고 주입·툴은 InventoryModule,
 * 상품 검색(search_products 툴)은 CommerceModule 을 import 한다.
 */
@Module({
  imports: [MemoryModule, InventoryModule, CommerceModule],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
