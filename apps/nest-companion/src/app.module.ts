import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CharacterModule } from './character/character.module';
import { ConversationModule } from './conversation/conversation.module';
import { InventoryModule } from './inventory/inventory.module';
import { LlmModule } from './llm/llm.module';
import { OcrModule } from './ocr/ocr.module';
import { MemoryModule } from './memory/memory.module';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RecipeModule } from './recipe/recipe.module';
import { UsageModule } from './usage/usage.module';

@Module({
  imports: [
    // .env 를 읽어 ConfigService 로 노출. isGlobal: 어디서든 주입 가능. validate: 시작 시 검증
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    CharacterModule,
    UsageModule, // LlmModule 앞 — 의존 방향(llm → usage)을 읽는 사람에게 보이려는 순서
    LlmModule,
    OcrModule,
    MemoryModule,
    InventoryModule,
    ConversationModule,
    RecipeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
