import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * 냉장고 재고. PrismaModule(@Global)·AuthModule(전역 export)에서 의존을 주입받는다.
 * InventoryService 는 ConversationModule 이 채팅 툴·프롬프트 주입에 쓰므로 export 한다.
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
