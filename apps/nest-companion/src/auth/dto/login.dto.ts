import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { LoginRequestType } from '@companion/types';

/** POST /auth/login 요청 본문 — 빈 값/과대 입력만 막고 실제 판정은 서비스에서 */
export class LoginDto implements LoginRequestType {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  loginId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72) // 유효 비번은 72바이트 이하라 문자 수도 72 이하 — 과대 페이로드 차단
  password!: string;
}
