-- Cashier shifts, cash journal, refund/print extensions

-- RefundStatus: add SUCCEEDED / FAILED / CANCELLED (keep COMPLETED/REJECTED for legacy)
DO $$ BEGIN
  ALTER TYPE "RefundStatus" ADD VALUE 'SUCCEEDED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "RefundStatus" ADD VALUE 'FAILED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "RefundStatus" ADD VALUE 'CANCELLED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CashierShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'FORCE_CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CashOperationType" AS ENUM ('OPENING', 'SALE', 'REFUND', 'IN', 'OUT', 'CLOSING', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "publicId" TEXT;
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "paymentId" TEXT;
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "providerRefundId" TEXT;
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

UPDATE "Refund" SET "publicId" = coalesce("publicId", 'rfd_' || "id") WHERE "publicId" IS NULL;
ALTER TABLE "Refund" ALTER COLUMN "publicId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Refund_publicId_key" ON "Refund"("publicId");
CREATE INDEX IF NOT EXISTS "Refund_paymentId_idx" ON "Refund"("paymentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Refund_paymentId_fkey') THEN
    ALTER TABLE "Refund"
      ADD CONSTRAINT "Refund_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PrintLog" ADD COLUMN IF NOT EXISTS "ticketId" TEXT;
ALTER TABLE "PrintLog" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'cashier';
CREATE INDEX IF NOT EXISTS "PrintLog_ticketId_idx" ON "PrintLog"("ticketId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintLog_ticketId_fkey') THEN
    ALTER TABLE "PrintLog"
      ADD CONSTRAINT "PrintLog_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CashierShift" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "status" "CashierShiftStatus" NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "openingCashAmount" INTEGER NOT NULL DEFAULT 0,
  "closingCashAmount" INTEGER,
  "expectedCashAmount" INTEGER,
  "cashDifferenceAmount" INTEGER,
  "cashSalesAmount" INTEGER NOT NULL DEFAULT 0,
  "cardSalesAmount" INTEGER NOT NULL DEFAULT 0,
  "onlineSalesAmount" INTEGER NOT NULL DEFAULT 0,
  "cashRefundsAmount" INTEGER NOT NULL DEFAULT 0,
  "ordersCount" INTEGER NOT NULL DEFAULT 0,
  "ticketsCount" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "closeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashierShift_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CashierShift_publicId_key" ON "CashierShift"("publicId");
CREATE INDEX IF NOT EXISTS "CashierShift_userId_status_idx" ON "CashierShift"("userId", "status");
CREATE INDEX IF NOT EXISTS "CashierShift_locationId_status_idx" ON "CashierShift"("locationId", "status");
CREATE INDEX IF NOT EXISTS "CashierShift_openedAt_idx" ON "CashierShift"("openedAt");
CREATE INDEX IF NOT EXISTS "CashierShift_status_idx" ON "CashierShift"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashierShift_userId_fkey') THEN
    ALTER TABLE "CashierShift"
      ADD CONSTRAINT "CashierShift_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashierShift_locationId_fkey') THEN
    ALTER TABLE "CashierShift"
      ADD CONSTRAINT "CashierShift_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CashOperation" (
  "id" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "CashOperationType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "comment" TEXT,
  "orderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashOperation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CashOperation_shiftId_createdAt_idx" ON "CashOperation"("shiftId", "createdAt");
CREATE INDEX IF NOT EXISTS "CashOperation_type_idx" ON "CashOperation"("type");
CREATE INDEX IF NOT EXISTS "CashOperation_orderId_idx" ON "CashOperation"("orderId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashOperation_shiftId_fkey') THEN
    ALTER TABLE "CashOperation"
      ADD CONSTRAINT "CashOperation_shiftId_fkey"
      FOREIGN KEY ("shiftId") REFERENCES "CashierShift"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashOperation_userId_fkey') THEN
    ALTER TABLE "CashOperation"
      ADD CONSTRAINT "CashOperation_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashOperation_orderId_fkey') THEN
    ALTER TABLE "CashOperation"
      ADD CONSTRAINT "CashOperation_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shiftId" TEXT;
CREATE INDEX IF NOT EXISTS "Order_shiftId_idx" ON "Order"("shiftId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_shiftId_fkey') THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_shiftId_fkey"
      FOREIGN KEY ("shiftId") REFERENCES "CashierShift"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
