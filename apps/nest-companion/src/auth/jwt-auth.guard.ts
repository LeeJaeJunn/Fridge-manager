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

    let payload: { sub?: unknown; type?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('유효하지 않거나 만료된 토큰입니다.');
    }

    // 서명 검증만으로는 부족 — payload 형태를 런타임에 확인한다.
    // (sub 누락 시 req.userId=undefined 로 흘러 소유권 쿼리가 오작동하는 것을 방지)
    if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.type !== 'access') {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
    req.userId = payload.sub;
    return true;
  }
}
