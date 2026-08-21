-- 로그인 키를 loginId(임의 문자열) → email 로 바꾸고, 로그인 수단을 AuthIdentity(1:N)로 분리한다.
-- 적용 시점에 유저가 0명이라(전부 테스트 계정이라 비웠다) email 을 곧장 NOT NULL 로 추가한다.

-- DropIndex
DROP INDEX "User_loginId_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "loginId",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "emailVerified" TIMESTAMP(3),
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable: 로그인 수단 1개 = 행 1개 (LOCAL/KAKAO/NAVER/GOOGLE)
CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");

-- CreateIndex: 한 소셜 계정이 두 유저에 붙는 것 방지
-- (번호만으론 부족하다 — 카카오 123 과 구글 123 은 서로 다른 사람이라 열쇠는 두 컬럼의 짝이다)
CREATE UNIQUE INDEX "AuthIdentity_provider_providerUserId_key" ON "AuthIdentity"("provider", "providerUserId");

-- CreateIndex: 한 유저에게 같은 provider 가 두 번 붙는 것 방지
CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key" ON "AuthIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
