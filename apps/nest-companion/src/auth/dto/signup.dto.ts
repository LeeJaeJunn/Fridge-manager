import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { SignupRequestType } from '@companion/types';
import { MaxByteLength } from './max-byte-length.decorator';

/** POST /auth/signup 요청 본문 */
export class SignupDto implements SignupRequestType {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{4,20}$/, {
    message: '아이디는 영문/숫자/밑줄 4~20자여야 합니다.',
  })
  loginId!: string;

  @IsString()
  @MinLength(8)
  @MaxByteLength(72) // bcrypt 72바이트 상한 (문자 수가 아니라 바이트 수로 제한)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  name?: string;
}
