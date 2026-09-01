import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { CookDishRequestType } from '@companion/types';
import { LIMITS } from '../../inventory/shelf-life';

class CookConsumeItemDto {
  @IsString()
  ingredientId!: string;

  @IsBoolean()
  finished!: boolean;

  // `null` = 수량을 건드리지 않는다. 그래서 **선택이 아니라 nullable 이 의미를 갖는다** —
  // `@IsOptional()` 이 null 을 통과시키고, 서비스가 `!== null` 로 갈라 본다.
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.quantityNoteMax)
  remaining!: string | null;
}

/**
 * POST /conversations/:id/messages/:messageId/cook 요청 본문 —
 * 사용자가 확인 카드에서 편집한 최종 소비 값.
 *
 * `add` 가 없는 게 `ApplyProposalDto` 와 다른 점이다. 요리는 재료를 쓰기만 하지 만들지 않는다.
 */
export class CookDishDto implements CookDishRequestType {
  // 한 요리의 재료 수라 상한이 넉넉해도 된다. 무한 배열만 막는다.
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CookConsumeItemDto)
  consume!: CookConsumeItemDto[];
}
