-- 빠른시작 프리셋 개념 제거: 캐릭터는 사용자가 필드로 직접 만든다(프리셋 선택 없음).
-- presetId 는 "어느 프리셋에서 출발했는지" 참고용이었으므로 함께 제거한다.

-- DropColumn
ALTER TABLE "Character" DROP COLUMN "presetId";
