-- AlterTable: real coordinates for "nearest theatre" support
ALTER TABLE "Theatre" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Theatre" ADD COLUMN "lon" DOUBLE PRECISION;
