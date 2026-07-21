import type {
  IngredientCategoryType,
  StorageAreaType,
  UpdateIngredientRequestType,
} from '@companion/types';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CATEGORY_VALUES, LIMITS, STORAGE_VALUES } from '../shelf-life';

/**
 * PATCH /inventory/:id — 교정용 부분 수정.
 * expiresAt 을 고치면 서버가 expirySource 를 USER 로 승격한다(추정치 → 확정값).
 */
export class UpdateIngredientDto implements UpdateIngredientRequestType {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.nameMax)
  name?: string;

  @IsOptional()
  @IsIn(CATEGORY_VALUES)
  category?: IngredientCategoryType;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.quantityNoteMax)
  quantityNote?: string;

  @IsOptional()
  @IsIn(STORAGE_VALUES)
  storage?: StorageAreaType;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
