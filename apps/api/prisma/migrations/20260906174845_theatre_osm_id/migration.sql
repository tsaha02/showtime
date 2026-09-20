-- AlterTable
ALTER TABLE "Theatre" ADD COLUMN "osmId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Theatre_osmId_key" ON "Theatre"("osmId");
