import type {
  AddIngredientInputType,
  AddIngredientsRequestType,
  ExpirySourceType,
  IngredientCategoryType,
  StorageAreaType,
} from '@companion/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CATEGORY_VALUES, EXPIRY_SOURCE_INPUT_VALUES, LIMITS, STORAGE_VALUES } from '../shelf-life';

/**
 * 재료 한 건. category/storage 는 선택 — 생략하면 서버가 기본값(ETC/FRIDGE)을 쓴다.
 * 선택지 값과 제한값은 shelf-life.ts 가 소유한다 — 숫자를 여기 직접 쓰지 말 것.
 */
export class AddIngredientItemDto implements AddIngredientInputType {
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.nameMax)
  name!: string;

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

  /** 사용자가 날짜를 정한 경우만. **없으면 미설정(null)으로 들어간다** — 서버는 추정하지 않는다. */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  /**
   * 위 날짜가 직접 고른 것(`USER`)인지 "기본값"(`ESTIMATED`)인지. 날짜가 없으면 무시된다.
   * ⚠️ 데코레이터가 없으면 `whitelist: true` 가 **조용히 지워서** 전부 `USER` 로 기록된다.
   */
  @IsOptional()
  @IsIn(EXPIRY_SOURCE_INPUT_VALUES)
  expirySource?: ExpirySourceType;
}

/** POST /inventory — "계란이랑 우유 사왔어" 처럼 여러 건을 한 번에 넣는다. */
export class AddIngredientsDto implements AddIngredientsRequestType {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LIMITS.itemsMax)
  @ValidateNested({ each: true })
  @Type(() => AddIngredientItemDto)
  items!: AddIngredientItemDto[];
}
