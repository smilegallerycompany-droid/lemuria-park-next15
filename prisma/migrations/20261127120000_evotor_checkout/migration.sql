CREATE TABLE "EvotorCheckout" (
 "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL UNIQUE REFERENCES "Order"("id") ON DELETE RESTRICT,
 "terminalId" TEXT NOT NULL, "claimId" TEXT, "state" TEXT NOT NULL DEFAULT 'QUEUED',
 "cashReceived" INTEGER, "changeAmount" INTEGER, "fiscalKey" TEXT UNIQUE, "result" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("state" IN ('QUEUED', 'CLAIMED', 'FISCALIZED', 'DECLINED')),
 CHECK (("cashReceived" IS NULL AND "changeAmount" IS NULL) OR ("cashReceived" IS NOT NULL AND "changeAmount" IS NOT NULL AND "cashReceived" >= 0 AND "changeAmount" >= 0))
);
CREATE UNIQUE INDEX "EvotorCheckout_terminalId_claimId_key" ON "EvotorCheckout"("terminalId", "claimId");
CREATE INDEX "EvotorCheckout_terminalId_state_createdAt_idx" ON "EvotorCheckout"("terminalId", "state", "createdAt");
