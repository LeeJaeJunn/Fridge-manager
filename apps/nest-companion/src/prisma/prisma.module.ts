import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global() 이라 한 번 등록하면 어느 모듈에서든 import 없이 PrismaService 를 주입할 수 있다.
 * (LlmModule 과 동일한 전역 패턴)
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
