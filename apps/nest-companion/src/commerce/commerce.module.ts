import { Module } from '@nestjs/common';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';

/**
 * 커머스(상품 검색). CommerceService 가 네이버를 직접 호출·정규화한다.
 * 나중에 프로바이더가 2개 이상 되면 그때 인터페이스+토큰으로 분리한다(지금은 불필요).
 * CommerceService 는 RecommendationModule 이 주입하므로 export 한다.
 */
@Module({
  controllers: [CommerceController],
  providers: [CommerceService],
  exports: [CommerceService],
})
export class CommerceModule {}
