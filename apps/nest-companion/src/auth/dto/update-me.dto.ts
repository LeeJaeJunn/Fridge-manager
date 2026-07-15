import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { UpdateMeRequestType } from '@companion/types';

/** PATCH /auth/me 요청 본문 — 현재 유저 이름 수정 */
export class UpdateMeDto implements UpdateMeRequestType {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  name!: string;
}
