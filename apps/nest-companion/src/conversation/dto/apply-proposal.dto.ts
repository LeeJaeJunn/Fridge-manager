import type { ApplyProposalRequestType } from '@companion/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AddIngredientItemDto } from '../../inventory/dto/add-ingredients.dto';
import { LIMITS } from '../../inventory/shelf-life';

/** 확정할 소비 항목 한 건 — remaining=null 이면 "다 씀". 제한값은 shelf-life 의 LIMITS 단일 출처. */
class ApplyProposalConsumeDto {
  @IsString()
  @IsNotEmpty()
  ingredientId!: string;

  // null(다 씀) 은 허용하고, 문자열일 때만 길이 검증한다.
  @ValidateIf((o: ApplyProposalConsumeDto) => o.remaining !== null)
  @IsString()
  @MaxLength(LIMITS.quantityNoteMax)
  remaining!: string | null;
}

/**
 * POST /conversations/:id/messages/:messageId/apply 본문 — 사용자가 카드에서 편집한 최종 값.
 *
 * `add` 는 **`POST /inventory` 와 같은 항목 DTO 를 재사용**한다. 사용자가 카드에서 고친 재료나
 * 냉장고 화면에서 직접 넣은 재료나 서버가 받는 모양·검증(이름 길이·분류 enum·개수 상한)은 같아야
 * 하고, 그 값들은 전부 `shelf-life.ts` 의 단일 출처에서 온다.
 */
export class ApplyProposalDto implements ApplyProposalRequestType {
  @IsArray()
  @ArrayMaxSize(LIMITS.itemsMax)
  @ValidateNested({ each: true })
  @Type(() => ApplyProposalConsumeDto)
  consume!: ApplyProposalConsumeDto[];

  @IsArray()
  @ArrayMaxSize(LIMITS.itemsMax)
  @ValidateNested({ each: true })
  @Type(() => AddIngredientItemDto)
  add!: AddIngredientItemDto[];
}
