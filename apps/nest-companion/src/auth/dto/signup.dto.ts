import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { SignupRequestType } from '@companion/types';
import { normalizeEmail } from '../email';
import { MaxByteLength } from './max-byte-length.decorator';

/** POST /auth/signup 요청 본문 (이메일+비밀번호 = `LOCAL` 가입) */
export class SignupDto implements SignupRequestType {
  // ⚠️ **`@IsEmail()` 보다 먼저 다듬어야 한다.** 검증은 원본 값을 보므로, trim 을 안 하면
  // 앞뒤 공백이 붙은 이메일이 "형식 오류"로 거절된다(실측으로 확인). 서비스도 같은 함수를
  // 부르지만 멱등이라 문제없고, 소셜 경로는 DTO 를 안 거치므로 양쪽 다 필요하다.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  @MaxLength(254) // 이메일 주소 실질 상한
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxByteLength(72) // bcrypt 72바이트 상한 (문자 수가 아니라 바이트 수로 제한)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  name?: string;
}
