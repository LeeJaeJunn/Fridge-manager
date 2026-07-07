import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CharacterModule } from './character/character.module';
import { CommerceModule } from './commerce/commerce.module';
import { ConversationModule } from './conversation/conversation.module';
import { LlmModule } from './llm/llm.module';
import { MemoryModule } from './memory/memory.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // .env 를 읽어 ConfigService 로 노출. isGlobal: 어디서든 주입 가능
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CharacterModule,
    LlmModule,
    MemoryModule,
    ConversationModule,
    CommerceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
