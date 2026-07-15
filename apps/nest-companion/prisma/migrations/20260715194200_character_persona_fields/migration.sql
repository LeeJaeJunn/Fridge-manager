-- 캐릭터 상세 설정: 구조화 필드 추가 + instruction 컬럼 제거(이제 필드에서 매번 조립).
-- 기존 row 는 name 을 유지하고 신규 필드는 NULL/빈 배열로 시작한다(buildPersonaInstruction 이 sparse 를 허용).

-- DropColumn (instruction 은 더 이상 저장하지 않는다)
ALTER TABLE "Character" DROP COLUMN "instruction";

-- AddColumn (구조화 속성)
ALTER TABLE "Character" ADD COLUMN     "actingRule" TEXT,
ADD COLUMN     "age" INTEGER,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "job" TEXT,
ADD COLUMN     "personality" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "relationship" TEXT,
ADD COLUMN     "speechStyle" TEXT,
ADD COLUMN     "userNickname" TEXT;
