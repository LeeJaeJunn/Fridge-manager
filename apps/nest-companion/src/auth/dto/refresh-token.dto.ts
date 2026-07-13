import { IsString, Length } from 'class-validator';

/**
 * POST /auth/refresh 및 /auth/logout 공용 본문.
 * refreshToken 은 randomBytes(32).toString('hex') = hex 64자. 형식 밖 입력은 조기 400.
 */
export class RefreshTokenDto {
  @IsString()
  @Length(64, 64)
  refreshToken!: string;
}
