import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import type { ChatMessageType, ChatRequestType, ChatRoleType } from '@companion/types';

/**
 * 공유 계약(ChatMessageType)을 implements 하고, 검증 데코레이터만 더한다.
 * 계약이 바뀌면 이 DTO가 모양을 안 지킬 때 컴파일 에러로 잡힌다 → 계약↔검증 동기화.
 */
export class ChatMessageDto implements ChatMessageType {
  @IsIn(['user', 'assistant'])
  role!: ChatRoleType;

  @IsString()
  @IsNotEmpty()
  content!: string;
}

/** POST /chat 요청 본문 — 공유 계약(ChatRequestType)을 implements */
export class ChatRequestDto implements ChatRequestType {
  @IsString()
  @IsNotEmpty()
  characterId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}
