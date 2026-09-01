-- Additive refund line items + idempotency key.
-- No DROP, no rewrite of existing Refund rows, no backfill required.

ALTER TABLE "Refund" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

CREATE TABLE "RefundTicket" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefundTicket_refundId_ticketId_key" ON "RefundTicket"("refundId", "ticketId");
CREATE INDEX "RefundTicket_ticketId_idx" ON "RefundTicket"("ticketId");

ALTER TABLE "RefundTicket" ADD CONSTRAINT "RefundTicket_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundTicket" ADD CONSTRAINT "RefundTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
