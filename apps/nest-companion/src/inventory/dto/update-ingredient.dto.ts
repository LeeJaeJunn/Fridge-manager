import type {
  ExpirySourceType,
  IngredientCategoryType,
  StorageAreaType,
  UpdateIngredientRequestType,
} from '@companion/types';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CATEGORY_VALUES, EXPIRY_SOURCE_INPUT_VALUES, LIMITS, STORAGE_VALUES } from '../shelf-life';

/**
 * PATCH /inventory/:id — 교정용 부분 수정.
 *
 * ⚠️ `expiresAt` 은 **세 가지 뜻**이다 — 생략(미변경) / 날짜(그 날로) / `null`(미설정으로 되돌리기).
 * `@IsOptional()` 이 `null` 과 `undefined` 를 둘 다 통과시키고, 서비스가 `=== null` 로 가른다.
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
  expiresAt?: string | null;

  /** 위 날짜의 출처. 날짜를 보낼 때만 의미가 있다(생략하면 `USER`). */
  @IsOptional()
  @IsIn(EXPIRY_SOURCE_INPUT_VALUES)
  expirySource?: ExpirySourceType;
}
