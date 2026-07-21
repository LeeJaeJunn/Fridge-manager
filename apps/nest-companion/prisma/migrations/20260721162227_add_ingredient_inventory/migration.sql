-- CreateEnum
CREATE TYPE "StorageArea" AS ENUM ('FRIDGE', 'FREEZER', 'PANTRY');

-- CreateEnum
CREATE TYPE "ExpirySource" AS ENUM ('USER', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "IngredientCategory" AS ENUM ('VEGETABLE', 'FRUIT', 'MEAT', 'SEAFOOD', 'DAIRY', 'EGG', 'GRAIN', 'SAUCE', 'PROCESSED', 'FROZEN', 'ETC');

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "IngredientCategory" NOT NULL DEFAULT 'ETC',
    "quantityNote" TEXT,
    "storage" "StorageArea" NOT NULL DEFAULT 'FRIDGE',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expirySource" "ExpirySource" NOT NULL DEFAULT 'ESTIMATED',
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ingredient_userId_consumedAt_expiresAt_idx" ON "Ingredient"("userId", "consumedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
