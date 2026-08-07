import { IsIn, IsOptional } from 'class-validator';
import { SCAN_KINDS } from '../scan.prompt';

/**
 * `POST /inventory/scan` 의 파일 외 필드.
 * multipart 라 값이 문자열로 도착한다 — 전역 ValidationPipe 가 검증한다.
 */
export class ScanDto {
  /** 무엇을 찍은 이미지인지. 생략하면 영수증으로 본다. */
  @IsOptional()
  @IsIn(SCAN_KINDS)
  kind?: string;

  /**
   * OCR 을 함께 쓸지 (`'true'` 면 사용). 생략하면 이미지 단독.
   * 어느 쪽이 정확한지 **실측으로 비교**하려고 요청 단위로 켤 수 있게 뒀다 —
   * 결론이 나면 한쪽으로 고정하고 이 필드는 없앤다.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  ocr?: string;
}
