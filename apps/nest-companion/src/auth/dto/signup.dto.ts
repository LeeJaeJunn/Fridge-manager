import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { SignupRequestType } from '@companion/types';

/** POST /auth/signup 요청 본문 */
export class SignupDto implements SignupRequestType {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{4,20}$/, {
    message: '아이디는 영문/숫자/밑줄 4~20자여야 합니다.',
  })
  loginId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt 는 72바이트 초과분을 무시하므로 상한을 둔다
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  name?: string;
}
