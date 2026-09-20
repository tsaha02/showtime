-- AlterTable
ALTER TABLE "Movie" ADD COLUMN "tmdbId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Movie_tmdbId_key" ON "Movie"("tmdbId");
