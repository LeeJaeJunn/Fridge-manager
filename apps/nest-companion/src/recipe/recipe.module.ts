import { Module } from '@nestjs/common';
import { RecipeController } from './recipe.controller';
import { RecipeService } from './recipe.service';

/**
 * 레시피 검색. `RecipeService` 가 네이버 검색 API 를 직접 호출·정규화한다.
 * 프로바이더가 하나뿐이라 인터페이스+DI토큰으로 나누지 않는다 — 둘 이상(만개의레시피 등)이
 * 되면 그때 분리한다(`ocr/` 와 같은 판단, 과한 추상화 지양).
 *
 * `RecipeService` 는 채팅 툴(`ConversationModule`)이 주입받으므로 export 한다.
 */
@Module({
  controllers: [RecipeController],
  providers: [RecipeService],
  exports: [RecipeService],
})
export class RecipeModule {}
