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
}
