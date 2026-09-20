-- AlterEnum: add new WalletReason values
ALTER TYPE "WalletReason" ADD VALUE 'GIFT_CARD_REDEEMED';
ALTER TYPE "WalletReason" ADD VALUE 'LOYALTY_CASHBACK';

-- AlterTable: Seat wheelchair accessibility flag
ALTER TABLE "Seat" ADD COLUMN "wheelchairAccessible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Booking donation round-up
ALTER TABLE "Booking" ADD COLUMN "donationAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: GiftCard
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "purchasedByEmail" TEXT NOT NULL,
    "purchasedByUserId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "message" TEXT,
    "paymentIntentId" TEXT,
    "redeemed" BOOLEAN NOT NULL DEFAULT false,
    "redeemedByUserId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");
CREATE UNIQUE INDEX "GiftCard_paymentIntentId_key" ON "GiftCard"("paymentIntentId");

ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_purchasedByUserId_fkey" FOREIGN KEY ("purchasedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
