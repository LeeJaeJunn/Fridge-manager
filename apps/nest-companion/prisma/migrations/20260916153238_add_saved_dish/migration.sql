-- CreateTable
CREATE TABLE "SavedDish" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "dishName" TEXT NOT NULL,
    "servings" INTEGER NOT NULL,
    "cookMinutes" INTEGER,
    "ingredients" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedDish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedDish_userId_updatedAt_idx" ON "SavedDish"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedDish_userId_sourceMessageId_key" ON "SavedDish"("userId", "sourceMessageId");

-- AddForeignKey
ALTER TABLE "SavedDish" ADD CONSTRAINT "SavedDish_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
