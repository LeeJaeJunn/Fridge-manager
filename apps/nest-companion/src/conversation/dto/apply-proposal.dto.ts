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
import { LIMITS } from '../../inventory/shelf-life';

/** 확정할 소비 항목 한 건 — remaining=null 이면 "다 씀". 제한값은 shelf-life 의 LIMITS 단일 출처. */
class ApplyProposalItemDto {
  @IsString()
  @IsNotEmpty()
  ingredientId!: string;

  // null(다 씀) 은 허용하고, 문자열일 때만 길이 검증한다.
  @ValidateIf((o: ApplyProposalItemDto) => o.remaining !== null)
  @IsString()
  @MaxLength(LIMITS.quantityNoteMax)
  remaining!: string | null;
}

/** POST /conversations/:id/messages/:messageId/apply 본문 */
export class ApplyProposalDto implements ApplyProposalRequestType {
  @IsArray()
  @ArrayMaxSize(LIMITS.itemsMax)
  @ValidateNested({ each: true })
  @Type(() => ApplyProposalItemDto)
  items!: ApplyProposalItemDto[];
}
