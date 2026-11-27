-- Existing candidate jobs remain blocked until reconciled; do not reconstruct
-- fiscal lines from a mutable current catalog or mark them paid automatically.
ALTER TABLE "EvotorCheckout" ADD COLUMN "receiptPayload" JSONB;
