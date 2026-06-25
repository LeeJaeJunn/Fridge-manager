import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { DevAuthGuard } from './dev-auth.guard';
import { DevUserSeed } from './dev-user.seed';

/**
 * @Global() — 다른 모듈의 @UseGuards(DevAuthGuard) 에서도 DI로 가드를 쓰도록 export.
 * 진짜 인증으로 가면 이 모듈이 Passport 기반 AuthModule 로 발전한다.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [DevAuthGuard, DevUserSeed],
  exports: [DevAuthGuard],
})
export class AuthModule {}
