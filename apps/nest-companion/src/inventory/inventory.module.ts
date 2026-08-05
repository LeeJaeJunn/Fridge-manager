import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { ScanService } from './scan.service';

/**
 * 냉장고 재고. PrismaModule(@Global)·AuthModule(전역 export)·LlmModule(@Global)에서 의존을 주입받는다.
 * InventoryService 는 ConversationModule 이 채팅 툴·프롬프트 주입에 쓰므로 export 한다.
 * ScanService(영수증·사진 인식)는 컨트롤러만 쓰므로 export 하지 않는다.
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService, ScanService],
  exports: [InventoryService],
})
export class InventoryModule {}
