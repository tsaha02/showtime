-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "paymentIntentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_paymentIntentId_key" ON "Booking"("paymentIntentId");
