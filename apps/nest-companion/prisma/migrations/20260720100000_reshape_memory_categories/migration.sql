-- 메모리 카테고리를 구매 의사결정 중심으로 재설계한다(루트 README).
-- INTEREST/WORK/GOAL/LIFESTYLE/RELATIONSHIP/TRAIT/ETC → PREFERENCE/PROFILE/OWNERSHIP/ETC.
-- Postgres 는 enum 값 제거를 지원하지 않으므로 타입을 재생성하고 기존 row 를 리매핑한다.

-- 1. 기존 타입을 임시 이름으로 옮긴다
ALTER TYPE "MemoryCategory" RENAME TO "MemoryCategory_old";

-- 2. 새 타입 생성
CREATE TYPE "MemoryCategory" AS ENUM ('PREFERENCE', 'PROFILE', 'OWNERSHIP', 'ETC');

-- 3. 컬럼 기본값을 잠시 제거(타입 변환을 막으므로)
ALTER TABLE "Memory" ALTER COLUMN "category" DROP DEFAULT;

-- 4. 컬럼을 새 타입으로 변환하며 값 리매핑
--    INTEREST→PREFERENCE, 나머지 삶기록 계열→PROFILE, 목표·기타→ETC
ALTER TABLE "Memory"
  ALTER COLUMN "category" TYPE "MemoryCategory"
  USING (
    CASE "category"::text
      WHEN 'INTEREST' THEN 'PREFERENCE'
      WHEN 'WORK' THEN 'PROFILE'
      WHEN 'LIFESTYLE' THEN 'PROFILE'
      WHEN 'RELATIONSHIP' THEN 'PROFILE'
      WHEN 'TRAIT' THEN 'PROFILE'
      WHEN 'GOAL' THEN 'ETC'
      ELSE 'ETC'
    END::"MemoryCategory"
  );

-- 5. 기본값 복원(ETC 유지)
ALTER TABLE "Memory" ALTER COLUMN "category" SET DEFAULT 'ETC';

-- 6. 옛 타입 제거
DROP TYPE "MemoryCategory_old";
