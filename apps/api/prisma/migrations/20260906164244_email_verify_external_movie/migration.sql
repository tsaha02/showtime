-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Rename Movie.tmdbId -> Movie.externalId (index/constraint renamed to match)
ALTER TABLE "Movie" RENAME COLUMN "tmdbId" TO "externalId";
ALTER INDEX "Movie_tmdbId_key" RENAME TO "Movie_externalId_key";
