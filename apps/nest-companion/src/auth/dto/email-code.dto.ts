import type { SendCodeRequestType, VerifyCodeRequestType } from '@companion/types';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { normalizeEmail } from '../email';
import { VERIFICATION } from '../email-verification.service';

/**
 * 이메일 정규화 데코레이터 — `@IsEmail()` **보다 먼저** 다듬어야 한다.
 * 검증은 원본 값을 보므로 trim 을 안 하면 앞뒤 공백이 붙은 이메일이 형식 오류로 거절된다(실측).
 */
const NormalizeEmail = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );

/** POST /auth/email/send-code */
export class SendCodeDto implements SendCodeRequestType {
  @NormalizeEmail()
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  @MaxLength(254)
  email!: string;
}

/** POST /auth/email/verify-code */
export class VerifyCodeDto implements VerifyCodeRequestType {
  @NormalizeEmail()
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  @MaxLength(254)
  email!: string;

  // 자리수는 `VERIFICATION` 이 소유한다 — DTO 에 숫자를 직접 쓰면 두 곳이 어긋난다
  // (persona.ts 의 `LIMITS` 를 DTO 가 가져다 쓰는 것과 같은 규칙).
  @IsString()
  @Length(VERIFICATION.codeDigits, VERIFICATION.codeDigits, {
    message: `인증번호는 ${VERIFICATION.codeDigits}자리입니다.`,
  })
  code!: string;
}
