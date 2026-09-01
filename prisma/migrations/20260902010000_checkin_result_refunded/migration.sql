-- Additive enum value for check-in of a refunded ticket.
-- No DROP, no type change, no NOT NULL, no backfill of historical CANCELLED rows.
-- Historical TicketCheckIn.result = CANCELLED for refunded tickets stays CANCELLED.

-- PostgreSQL 12+: ADD VALUE may run inside a transaction, but the new label
-- cannot be used until this migration commits. Do not INSERT REFUNDED here.

ALTER TYPE "CheckInResult" ADD VALUE 'REFUNDED';
