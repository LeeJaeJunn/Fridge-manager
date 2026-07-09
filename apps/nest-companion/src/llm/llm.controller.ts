import { Controller, Get } from '@nestjs/common';
import { LlmService } from './llm.service';

/**
 * ⚠️ 임시 테스트용 — 네이버 상품 검색을 직접 확인하기 위한 엔드포인트 (LLM 없음).
 * 예) GET /products?query=조명&priceMin=20000&priceMax=50000&limit=5
 *     "더보기": 응답의 nextStart 를 start 로 그대로 다시 요청
 * 추천(RecommendationService)이 붙으면 이 컨트롤러는 제거 대상.
 */
@Controller('llm')
export class LlmController {
  constructor(private readonly llm: LlmService) {}

  @Get()
  test() {
    return this.llm.testImageAnalysis();
  }
}
