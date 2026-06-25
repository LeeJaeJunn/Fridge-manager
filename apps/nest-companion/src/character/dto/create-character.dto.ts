import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { CreateCharacterRequestType } from '@companion/types';

/** POST /characters 요청 본문 — 공유 계약(CreateCharacterRequestType)을 implements */
export class CreateCharacterDto implements CreateCharacterRequestType {
  @IsString()
  @MinLength(1)
  presetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  name?: string;
}
