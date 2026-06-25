import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 개발용 임시 인증 가드 — "현재 유저가 누구인지"를 결정해 req.userId 에 심는다.
 * - DEV_AUTH !== 'true' 면 차단(401). 진짜 인증이 아직 없으므로 프로덕션에서 새지 않게 한다.
 * - dev 에선 헤더 `x-user-id` 가 있으면 그걸, 없으면 env `DEV_USER_ID` 를 현재 유저로 본다.
 *
 * ⚠️ 임시: 진짜 로그인(Passport + JWT) 붙일 때 JwtAuthGuard 로 교체한다.
 *    그때도 req.userId(또는 req.user) 세팅 방식만 같으면 @CurrentUser() 사용처는 무변경.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get<string>('DEV_AUTH') !== 'true') {
      throw new UnauthorizedException('인증이 필요합니다.');
    }

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      userId?: string;
    }>();

    const userId = req.headers['x-user-id'] ?? this.config.get<string>('DEV_USER_ID');
    if (!userId) {
      throw new UnauthorizedException('현재 유저를 확인할 수 없습니다.');
    }

    req.userId = userId;
    return true;
  }
}
