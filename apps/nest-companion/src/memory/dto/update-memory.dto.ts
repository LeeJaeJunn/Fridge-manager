import type { MemoryCategoryType, UpdateMemoryRequestType } from '@companion/types';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { MEMORY_CATEGORIES, MEMORY_LIMITS } from '../memory.options';

export class UpdateMemoryDto implements UpdateMemoryRequestType {
  // IsOptional 은 null 도 건너뛴다. 생략만 허용하고 null 은 검증에서 거부한다.
  @ValidateIf((dto: UpdateMemoryDto) => typeof dto.category !== 'undefined')
  @IsIn(MEMORY_CATEGORIES)
  category?: MemoryCategoryType;

  @ValidateIf((dto: UpdateMemoryDto) => typeof dto.content !== 'undefined')
  @IsString()
  @MinLength(1)
  @MaxLength(MEMORY_LIMITS.contentMax)
  content?: string;
}
