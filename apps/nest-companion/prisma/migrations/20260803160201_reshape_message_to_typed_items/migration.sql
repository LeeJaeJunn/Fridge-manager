/*
  Warnings:

  - You are about to drop the column `hasMoreProducts` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `pendingChange` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `products` on the `Message` table. All the data in the column will be lost.
  - Added the required column `type` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MessageItemType" AS ENUM ('TEXT', 'FUNCTION_CALL', 'FUNCTION_CALL_OUTPUT');

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "hasMoreProducts",
DROP COLUMN "pendingChange",
DROP COLUMN "products",
ADD COLUMN     "payload" JSONB,
ADD COLUMN     "type" "MessageItemType" NOT NULL,
ALTER COLUMN "role" DROP NOT NULL,
ALTER COLUMN "content" DROP NOT NULL;
