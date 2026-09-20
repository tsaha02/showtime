-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('CONCERT', 'COMEDY', 'SPORTS', 'THEATRE_PLAY', 'WORKSHOP', 'OTHER');

-- CreateEnum
CREATE TYPE "ShowKind" AS ENUM ('MOVIE', 'EVENT');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "durationMins" INTEGER NOT NULL,
    "posterUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Show becomes a generic "bookable session" for a Movie OR an Event
ALTER TABLE "Show" ADD COLUMN "kind" "ShowKind" NOT NULL DEFAULT 'MOVIE';
ALTER TABLE "Show" ADD COLUMN "eventId" TEXT;
ALTER TABLE "Show" ALTER COLUMN "movieId" DROP NOT NULL;

-- Existing rows are all movie shows — make that explicit and enforced
ALTER TABLE "Show" ADD CONSTRAINT "Show_kind_xor_check" CHECK (
  (kind = 'MOVIE' AND "movieId" IS NOT NULL AND "eventId" IS NULL) OR
  (kind = 'EVENT' AND "eventId" IS NOT NULL AND "movieId" IS NULL)
);

CREATE INDEX "Show_eventId_idx" ON "Show"("eventId");

ALTER TABLE "Show" ADD CONSTRAINT "Show_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The existing Movie FK was NOT NULL; now that movieId is nullable, drop
-- and recreate it so ON DELETE CASCADE still applies (Prisma's own FK
-- creation for an optional relation is otherwise identical).
ALTER TABLE "Show" DROP CONSTRAINT "Show_movieId_fkey";
ALTER TABLE "Show" ADD CONSTRAINT "Show_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
