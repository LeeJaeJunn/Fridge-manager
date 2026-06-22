import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 모든 요청 본문을 DTO 기준으로 검증.
  // whitelist: DTO에 없는 필드 제거 / transform: 본문을 DTO 인스턴스로 변환
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 브라우저(Expo 웹 등) 교차 출처 요청 허용 — 개발 편의용
  app.enableCors();

  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
