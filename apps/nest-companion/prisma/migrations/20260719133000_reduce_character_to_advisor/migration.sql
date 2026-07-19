-- 캐릭터를 "조언자 톤"으로 축소: 이름·말투·호칭만 남기고 롤플레이 페르소나 필드를 제거한다.
-- (제품 방향 전환: 나를 기억하는 의사결정 컴패니언 — 루트 README 참고)
ALTER TABLE "Character" DROP COLUMN "age";
ALTER TABLE "Character" DROP COLUMN "gender";
ALTER TABLE "Character" DROP COLUMN "relationship";
ALTER TABLE "Character" DROP COLUMN "personality";
ALTER TABLE "Character" DROP COLUMN "job";
ALTER TABLE "Character" DROP COLUMN "actingRule";
