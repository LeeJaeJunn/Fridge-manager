import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { LoginRequestType } from '@companion/types';
import { normalizeEmail } from '../email';

/** POST /auth/login 요청 본문 — 형식·과대 입력만 막고 실제 판정은 서비스에서 */
export class LoginDto implements LoginRequestType {
  // `@IsEmail()` 보다 먼저 다듬는다 — 이유는 signup.dto.ts 주석 참고.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72) // 유효 비번은 72바이트 이하라 문자 수도 72 이하 — 과대 페이로드 차단
  password!: string;
}
