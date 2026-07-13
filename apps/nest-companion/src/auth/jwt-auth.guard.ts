import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * access token(JWT) 을 검증해 "현재 유저가 누구인지"를 결정하고 req.userId 에 심는다.
 * - Authorization: Bearer <accessToken> 없으면 401.
 * - 서명/만료 검증 실패 시 401 (JwtService.verifyAsync 가 throw).
 *
 * DevAuthGuard 를 대체한다. req.userId 계약이 동일하므로 @CurrentUser() 사용처는 무변경.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      userId?: string;
    }>();

    const header = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token) {
      throw new UnauthorizedException('인증이 필요합니다.');
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      req.userId = payload.sub;
    } catch {
      throw new UnauthorizedException('유효하지 않거나 만료된 토큰입니다.');
    }
    return true;
  }
}
