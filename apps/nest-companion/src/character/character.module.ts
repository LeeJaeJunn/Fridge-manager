import { Module } from '@nestjs/common';
import { CharacterController } from './character.controller';
import { CharacterService } from './character.service';

/**
 * PrismaService(전역)와 JwtAuthGuard(전역 AuthModule export)를 그대로 주입받으므로
 * 별도 import 가 필요 없다.
 */
@Module({
  controllers: [CharacterController],
  providers: [CharacterService],
})
export class CharacterModule {}
