import { IsString } from 'class-validator';

/** POST /auth/refresh 및 /auth/logout 공용 본문 */
export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}
