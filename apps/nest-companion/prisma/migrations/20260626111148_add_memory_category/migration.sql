-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('INTEREST', 'WORK', 'GOAL', 'LIFESTYLE', 'RELATIONSHIP', 'TRAIT', 'ETC');

-- AlterTable
ALTER TABLE "Memory" ADD COLUMN     "category" "MemoryCategory" NOT NULL DEFAULT 'ETC';
