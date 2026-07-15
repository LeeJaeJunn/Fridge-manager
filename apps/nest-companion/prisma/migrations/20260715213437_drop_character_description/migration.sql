-- description 제거: 관계+성격에서 기계적으로 만든 파생 문자열이라 저장할 이유가 없다.
-- (소비처 0, staleness 위험, 클라가 relationship/personality 로 직접 렌더 가능)

-- DropColumn
ALTER TABLE "Character" DROP COLUMN "description";
