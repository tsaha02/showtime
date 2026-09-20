-- AlterTable: Show format/language
ALTER TABLE "Show" ADD COLUMN "format" TEXT NOT NULL DEFAULT '2D';
ALTER TABLE "Show" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'English';

-- AlterTable: Booking coupon fields
ALTER TABLE "Booking" ADD COLUMN "couponCode" TEXT;
ALTER TABLE "Booking" ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FLAT');

-- CreateTable: Coupon
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateTable: Waitlist
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Waitlist_movieId_email_key" ON "Waitlist"("movieId", "email");
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
