import { IsString } from 'class-validator';
import type { LoginRequestType } from '@companion/types';

/** POST /auth/login 요청 본문 — 형식 검증은 최소화(존재 여부만) */
export class LoginDto implements LoginRequestType {
  @IsString()
  loginId!: string;

  @IsString()
  password!: string;
}
