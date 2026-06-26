import { IsString, MinLength } from 'class-validator';
import type { CreateCharacterRequestType } from '@companion/types';

/** POST /characters 요청 본문 — 프리셋만 선택 (이름은 프리셋 기본값, 수정은 PATCH로 나중) */
export class CreateCharacterDto implements CreateCharacterRequestType {
  @IsString()
  @MinLength(1)
  presetId!: string;
}
