import { Global, Module } from '@nestjs/common';
import { OcrService } from './ocr.service';

/**
 * OCR (이미지 → 텍스트). 지금은 NAVER CLOVA OCR 한 곳뿐이라 인터페이스+DI토큰으로 쪼개지 않는다
 * (commerce/ 와 같은 판단 — 프로바이더가 둘 이상 되면 그때 분리).
 *
 * @Global 인 이유는 LlmModule 과 같다: 인식 경로가 여러 모듈에 퍼질 수 있어서.
 */
@Global()
@Module({
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
