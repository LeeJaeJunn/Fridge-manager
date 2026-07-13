import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 현재 요청을 보낸 유저의 id 를 핸들러 파라미터에 주입한다.
 * 값은 가드(JwtAuthGuard)가 access token 을 검증한 뒤 req.userId 에 심어둔 것.
 * 가드를 교체해도 이 데코레이터를 쓰는 핸들러는 바뀌지 않는다.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<{ userId: string }>();
  return req.userId;
});
