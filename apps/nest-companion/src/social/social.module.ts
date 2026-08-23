import { Module } from '@nestjs/common';
import { KakaoClient } from './kakao.client';
import { SocialService } from './social.service';

/** 소셜 로그인 벤더 계층. 컨트롤러가 없다 — 라우트는 `AuthModule` 이 소유한다(세션 발급과 붙어 있어야 해서). */
@Module({
  providers: [SocialService, KakaoClient],
  exports: [SocialService],
})
export class SocialModule {}
