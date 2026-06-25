import { IsString, MaxLength, MinLength } from 'class-validator';
import type { UpdateCharacterRequestType } from '@companion/types';

/** PATCH /characters/me 요청 본문 — 공유 계약(UpdateCharacterRequestType)을 implements */
export class UpdateCharacterDto implements UpdateCharacterRequestType {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name!: string;
}
