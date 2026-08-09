import type { RecipeSearchResultType, RecipeSourceType } from '@companion/types';
import { Controller, Get, Query } from '@nestjs/common';
import { RecipeService } from './recipe.service';

/**
 * ⚠️ 임시 테스트용 — 검색 품질을 **채팅을 안 거치고 눈으로 확인**하기 위한 엔드포인트 (LLM 없음).
 * 예) GET /recipes?dish=김치찌개
 *     GET /recipes?dish=김치찌개&source=blog&limit=3
 *
 * 가드가 없다(공개). 지금은 개발용이라 그대로 두지만, **앱에서 직접 레시피를 검색하는 기능**을
 * 붙일 때 `JwtAuthGuard` 를 함께 붙인다 — 그때부터는 네이버 쿼터를 태우는 공개 프록시가 되므로.
 */
@Controller('recipes')
export class RecipeController {
  constructor(private readonly recipes: RecipeService) {}

  @Get()
  search(
    @Query('dish') dish = '',
    @Query('source') source?: string,
    @Query('limit') limit?: string,
  ): Promise<RecipeSearchResultType> {
    // 개발용이라 짧게 쓰게 둔다 — 'blog' 만 블로그, 그 외(미지정 포함)는 기본인 웹문서.
    const resolved: RecipeSourceType = source === 'blog' ? 'naver_blog' : 'naver_web';
    return this.recipes.search(dish, {
      source: resolved,
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }
}
