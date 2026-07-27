-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "idempotencyPayloadHash" TEXT,
ADD COLUMN     "paymentExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "idempotencyPayloadHash" TEXT;

-- CreateIndex
CREATE INDEX "Order_status_paymentExpiresAt_idx" ON "Order"("status", "paymentExpiresAt");
