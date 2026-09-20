-- AlterTable: User wallet + referral fields
ALTER TABLE "User" ADD COLUMN "walletBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN "referredById" TEXT;
ALTER TABLE "User" ADD COLUMN "referralBonusAwarded" BOOLEAN NOT NULL DEFAULT false;

-- Backfill a unique referral code for existing users before enforcing NOT NULL
UPDATE "User" SET "referralCode" = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) WHERE "referralCode" IS NULL;
ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "WalletReason" AS ENUM ('CANCELLATION_REFUND', 'REFERRAL_BONUS', 'SPENT_AT_CHECKOUT', 'ADMIN_ADJUSTMENT');

-- CreateTable: WalletTransaction
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "WalletReason" NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WalletTransaction_userId_idx" ON "WalletTransaction"("userId");
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Rating spoiler flag
ALTER TABLE "Rating" ADD COLUMN "isSpoiler" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: RatingVote
CREATE TABLE "RatingVote" (
    "id" TEXT NOT NULL,
    "ratingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RatingVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RatingVote_ratingId_userId_key" ON "RatingVote"("ratingId", "userId");
ALTER TABLE "RatingVote" ADD CONSTRAINT "RatingVote_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "Rating"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RatingVote" ADD CONSTRAINT "RatingVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Booking food/wallet fields
ALTER TABLE "Booking" ADD COLUMN "foodTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "walletAmountUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "FoodCategory" AS ENUM ('SNACK', 'DRINK', 'COMBO');

-- CreateTable: FoodItem
CREATE TABLE "FoodItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "category" "FoodCategory" NOT NULL,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BookingFoodItem
CREATE TABLE "BookingFoodItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "foodItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "BookingFoodItem_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BookingFoodItem" ADD CONSTRAINT "BookingFoodItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingFoodItem" ADD CONSTRAINT "BookingFoodItem_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
