import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import type { ResetPasswordRequestType } from '@companion/types';
import { normalizeEmail } from '../email';
import { MaxByteLength } from './max-byte-length.decorator';

/**
 * POST /auth/password/reset 요청 본문.
 *
 * 필드가 `SignupDto` 와 같은 건 우연이 아니다 — 둘 다 "이메일 인증을 통과했다는 증표 + 새
 * 비밀번호"이기 때문이다. 그래도 상속하지 않는 건, 검증 규칙이 갈릴 여지가 있고(가입만 약관
 * 동의를 받는다든지) 상속으로 묶어두면 한쪽 변경이 다른 쪽에 조용히 번져서다.
 */
export class ResetPasswordDto implements ResetPasswordRequestType {
  // ⚠️ `@IsEmail()` 보다 먼저 다듬어야 한다 — `SignupDto` 주석 참고.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxByteLength(72) // bcrypt 72바이트 상한
  password!: string;

  // **필수다.** 선택으로 두면 코드를 못 본 사람도 남의 비밀번호를 바꿀 수 있다.
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  verificationToken!: string;
}
