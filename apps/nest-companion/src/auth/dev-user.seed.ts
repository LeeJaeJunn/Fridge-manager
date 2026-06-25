import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 개발 편의용: 앱 부팅 시 dev 유저 한 명을 보장(upsert)한다.
 * - DEV_AUTH=true 일 때만 동작 (프로덕션에선 아무것도 안 함).
 * - 고정 id(DEV_USER_ID)로 만들어, 로그인 없이 @CurrentUser() 가 이 유저를 가리키게 한다.
 *
 * ⚠️ 임시: 진짜 회원가입/로그인 붙이면 제거한다.
 */
@Injectable()
export class DevUserSeed implements OnModuleInit {
  private readonly logger = new Logger(DevUserSeed.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (this.config.get<string>('DEV_AUTH') !== 'true') return;

    const id = this.config.getOrThrow<string>('DEV_USER_ID');
    await this.prisma.user.upsert({
      where: { id },
      update: {},
      create: { id, loginId: 'dev', passwordHash: '', name: '개발자' },
    });
    this.logger.log(`dev 유저 준비됨 (id=${id})`);
  }
}
