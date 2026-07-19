import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { SpeechStyleType, UpdateCharacterRequestType } from '@companion/types';
import { LIMITS, SPEECH_STYLE_VALUES } from '../persona';

/**
 * PATCH /characters/me 요청 본문 — 부분 수정 (보낸 필드만 갱신).
 * 전부 @IsOptional. 관심사는 캐릭터가 아니라 메모리라 여기서 다루지 않는다(메모리 API 로 관리).
 * 제한값은 create 와 마찬가지로 persona.ts 의 LIMITS 를 쓴다(숫자 직접 쓰지 말 것).
 */
export class UpdateCharacterDto implements UpdateCharacterRequestType {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.nameMax)
  name?: string;

  @IsOptional()
  @IsIn(SPEECH_STYLE_VALUES)
  speechStyle?: SpeechStyleType;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.userNicknameMax)
  userNickname?: string | null;
}
