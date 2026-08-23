import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { SocialModule } from '../social/social.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { JwtAuthGuard } from './jwt-auth.guard';

// access token 발급자 식별자 — 서명/검증 양쪽에 동일하게 적용
const JWT_ISSUER = 'companion';

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
        // expiresIn 은 ms 의 StringValue 타입이라 generic string 을 그 타입으로 캐스팅한다.
        // (env.validation 이 형식을 이미 검증하므로 런타임엔 안전)
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_TTL') ?? '15m') as JwtSignOptions['expiresIn'],
          issuer: JWT_ISSUER,
        },
        verifyOptions: { issuer: JWT_ISSUER },
      }),
    }),
    SocialModule, // 소셜 로그인 벤더 계층 — 라우트는 AuthController 가 갖고 여기서 신원만 받아온다
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailVerificationService, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
