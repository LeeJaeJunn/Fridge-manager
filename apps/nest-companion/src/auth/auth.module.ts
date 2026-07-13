import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * @Global() — 다른 모듈의 @UseGuards(JwtAuthGuard) 에서 DI 로 가드를 쓰도록 export.
 * access token(JWT) 서명/검증에 쓰는 secret·만료는 env 에서 온다.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      // global: JwtService 를 앱 전역에 노출 → 각 모듈의 @UseGuards(JwtAuthGuard) 가 주입받을 수 있음
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // expiresIn 은 ms 의 StringValue 타입이라 generic string 을 직접 못 넣어 캐스팅한다.
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_TTL') ?? '15m') as unknown as number,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
