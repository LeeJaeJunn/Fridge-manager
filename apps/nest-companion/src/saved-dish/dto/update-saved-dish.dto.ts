import type { UpdateSavedDishRequestType } from '@companion/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SAVED_DISH_LIMITS } from '../saved-dish.limits';
import { SavedDishIngredientDto } from './save-dish.dto';

export class UpdateSavedDishDto implements UpdateSavedDishRequestType {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(SAVED_DISH_LIMITS.dishNameMax)
  dishName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SAVED_DISH_LIMITS.servingsMax)
  servings?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SAVED_DISH_LIMITS.cookMinutesMax)
  cookMinutes?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SAVED_DISH_LIMITS.ingredientsMax)
  @ValidateNested({ each: true })
  @Type(() => SavedDishIngredientDto)
  ingredients?: SavedDishIngredientDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SAVED_DISH_LIMITS.stepsMax)
  @IsString({ each: true })
  @MaxLength(SAVED_DISH_LIMITS.stepMax, { each: true })
  steps?: string[];
}
