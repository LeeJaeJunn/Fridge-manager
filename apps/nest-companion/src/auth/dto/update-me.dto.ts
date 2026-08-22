import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { UpdateMeRequestType } from '@companion/types';
import { LIMITS } from '../../character/persona';

/** PATCH /auth/me 요청 본문 — 현재 유저 이름 수정 */
export class UpdateMeDto implements UpdateMeRequestType {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.userNameMax) // 숫자를 여기 박지 않는다 — persona.ts 가 단일 출처
  name!: string;
}
