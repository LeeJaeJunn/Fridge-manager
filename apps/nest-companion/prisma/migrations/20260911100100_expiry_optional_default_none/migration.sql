-- 유통기한을 **선택값**으로. null = 미설정이고, 그게 새 기본값이다.
-- (서버가 카테고리×보관위치로 추정해 자동으로 채우던 것을 걷어낸다 — schema.prisma 주석 참고)
ALTER TABLE "Ingredient" ALTER COLUMN "expiresAt" DROP NOT NULL;
ALTER TABLE "Ingredient" ALTER COLUMN "expirySource" SET DEFAULT 'NONE';

-- 기존 자동 추정치를 비운다.
-- 그 행들은 **사용자가 "기본값"을 고른 게 아니라 서버가 임의로 채운 값**이라, 새 정의
-- (ESTIMATED = 사용자가 기본값을 선택함)에 맞지 않는다. 그대로 두면 우리가 지어낸 날짜가
-- "사용자가 정한 날"로 둔갑해 영원히 남는다.
-- ⚠️ 날짜와 출처를 **함께** 되돌린다 — 둘은 짝이라 한쪽만 고치면 어긋난다.
UPDATE "Ingredient"
SET "expiresAt" = NULL, "expirySource" = 'NONE'
WHERE "expirySource" = 'ESTIMATED';
