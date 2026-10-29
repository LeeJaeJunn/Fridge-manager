import type { CreateMemoryRequestType, MemoryCategoryType } from '@companion/types';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { MEMORY_CATEGORIES, MEMORY_LIMITS } from '../memory.options';

export class CreateMemoryDto implements CreateMemoryRequestType {
  @IsIn(MEMORY_CATEGORIES)
  category!: MemoryCategoryType;

  @IsString()
  @MinLength(1)
  @MaxLength(MEMORY_LIMITS.contentMax)
  content!: string;
}
