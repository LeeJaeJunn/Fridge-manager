-- ExpirySource 에 'NONE'(미설정) 추가.
--
-- ⚠️ **다음 마이그레이션과 반드시 분리해야 한다.** Postgres 는 트랜잭션 안에서
--    `ALTER TYPE ... ADD VALUE` 자체는 허용하지만, **같은 트랜잭션 안에서 그 새 값을 쓰는 것은
--    막는다.** Prisma 는 마이그레이션 파일 하나를 한 트랜잭션으로 실행하므로,
--    'NONE' 을 쓰는 백필 UPDATE 를 여기 합치면 실패한다.
ALTER TYPE "ExpirySource" ADD VALUE 'NONE';
