import type { SaveDishRequestType, SavedDishIngredientType } from '@companion/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SAVED_DISH_LIMITS } from '../saved-dish.limits';

export class SavedDishIngredientDto implements SavedDishIngredientType {
  @IsString()
  @MinLength(1)
  @MaxLength(SAVED_DISH_LIMITS.ingredientNameMax)
  name!: string;

  // 양은 비어 있어도 된다("적당히") — MinLength 를 걸지 않는다.
  @IsString()
  @MaxLength(SAVED_DISH_LIMITS.amountMax)
  amount!: string;
}

export class SaveDishDto implements SaveDishRequestType {
  @IsString()
  @IsNotEmpty()
  sourceMessageId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SAVED_DISH_LIMITS.dishNameMax)
  dishName!: string;

  @IsInt()
  @Min(1)
  @Max(SAVED_DISH_LIMITS.servingsMax)
  servings!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SAVED_DISH_LIMITS.cookMinutesMax)
  cookMinutes?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SAVED_DISH_LIMITS.ingredientsMax)
  @ValidateNested({ each: true })
  @Type(() => SavedDishIngredientDto)
  ingredients!: SavedDishIngredientDto[];

  @IsArray()
  @ArrayMaxSize(SAVED_DISH_LIMITS.stepsMax)
  @IsString({ each: true })
  @MaxLength(SAVED_DISH_LIMITS.stepMax, { each: true })
  steps!: string[];
}
