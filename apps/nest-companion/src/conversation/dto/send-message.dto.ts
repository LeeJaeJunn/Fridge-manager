import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { SendMessageRequestType } from '@companion/types';

/** 메시지 전송 본문 — 새 대화 시작/기존 대화 둘 다 사용 */
export class SendMessageDto implements SendMessageRequestType {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}
