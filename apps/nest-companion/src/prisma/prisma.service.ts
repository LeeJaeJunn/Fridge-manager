import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * 앱 전체의 DB 진입점. PrismaClient 를 상속해 모델 쿼리(this.user, this.message …)를 그대로 노출한다.
 * 드라이버 어댑터(@prisma/adapter-pg)로 연결하고, Nest 생명주기에 맞춰 connect/disconnect 한다.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('DB 연결됨');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
