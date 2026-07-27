import { Prisma, type Reservation, type ReservationItem } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import { assertSessionBookable } from "@/server/domain/session.domain";
import { assertCapacity } from "@/server/domain/availability.domain";
import {
  assertIdempotencyPayloadMatches,
  hashIdempotencyPayload,
} from "@/server/domain/idempotency.domain";
import {
  buildReservationLineItems,
  computeReservationExpiry,
  sumRequestedQuantity,
} from "@/server/domain/reservation.domain";
import { sessionRepository } from "@/server/repositories/session.repository";
import { reservationRepository } from "@/server/repositories/reservation.repository";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";
import { expireStalePaymentOrders } from "@/server/services/order-cleanup";
import { getSessionAvailability } from "@/server/services/availability";
import { findTicketTypeByCode, resolveTicketPrice } from "@/server/services/pricing";
import type { CreateReservationInput } from "@/lib/validation/reservation";

export type ReservationWithItems = Reservation & { items: ReservationItem[] };

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/** Small jittered backoff so retried transactions don't immediately re-collide. */
function retryDelayMs(attempt: number): number {
  return DOMAIN_CONFIG.serializationRetryBaseDelayMs * attempt + Math.floor(Math.random() * 25);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ReservationService — orchestrates Domain (bookability/expiry/pricing
 * rules) and Repository (data access) to create a seat reservation.
 * Enforces:
 *  - the session must exist and currently accept bookings (SessionDomain),
 *  - price is always resolved server-side (PricingService — never trusts
 *    client input),
 *  - the requested quantity must fit within remaining capacity
 *    (AvailabilityDomain),
 *  - the whole check-then-write runs inside a single Serializable
 *    transaction (plus an explicit row lock on the Session), retried on
 *    write conflicts, so concurrent requests can never oversell the same
 *    seats.
 *
 * If `idempotencyKey` is supplied and a reservation already exists for it,
 * that existing reservation is returned instead of creating a duplicate —
 * unless the incoming payload differs, in which case `IDEMPOTENCY_CONFLICT`
 * is raised.
 */
export async function createReservation(
  input: CreateReservationInput,
  idempotencyKey?: string,
): Promise<ReservationWithItems> {
  if (idempotencyKey) {
    const existing = await reservationRepository.findByIdempotencyKey(prisma, idempotencyKey);
    if (existing) {
      assertIdempotencyPayloadMatches(existing.idempotencyPayloadHash, input);
      return existing;
    }
  }

  for (let attempt = 1; attempt <= DOMAIN_CONFIG.maxSerializationRetries; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => createReservationInTransaction(tx, input, idempotencyKey),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const isLastAttempt = attempt === DOMAIN_CONFIG.maxSerializationRetries;
      if (isSerializationConflict(error) && !isLastAttempt) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      throw error;
    }
  }

  // Unreachable — the loop above always returns or throws.
  throw new DomainError("SESSION_NOT_FOUND", "Не удалось создать резервирование");
}

async function createReservationInTransaction(
  tx: DbClient,
  input: CreateReservationInput,
  idempotencyKey: string | undefined,
): Promise<ReservationWithItems> {
  const now = new Date();

  // Free up seats held by holds/unpaid orders that have already expired before checking availability.
  await Promise.all([expireStaleReservations(tx, now), expireStalePaymentOrders(tx, now)]);

  const session = await sessionRepository.findByPublicId(tx, input.sessionPublicId);
  assertSessionBookable(session, now);

  // Explicit row lock on the Session, scoped by its own id (which is itself
  // scoped to a single locationId) — belt-and-suspenders on top of the
  // Serializable isolation level, which already guarantees no overselling.
  await sessionRepository.lockForUpdate(tx, session.id);

  const requestedItems = input.items.filter((item) => item.quantity > 0);
  const totalRequested = sumRequestedQuantity(requestedItems);

  const availability = await getSessionAvailability(tx, session.id, now);
  assertCapacity(availability, totalRequested);

  const resolvedPrices = await Promise.all(
    requestedItems.map(async (item) => {
      const ticketType = await findTicketTypeByCode(tx, item.ticketTypeCode).catch((error) => {
        if (error instanceof DomainError && error.code === "TICKET_TYPE_NOT_FOUND") {
          throw new DomainError(
            "INVALID_TICKET_TYPE",
            `Неизвестный тип билета «${item.ticketTypeCode}»`,
            { ticketTypeCode: item.ticketTypeCode },
          );
        }
        throw error;
      });
      return resolveTicketPrice(tx, {
        locationId: session.locationId,
        ticketTypeId: ticketType.id,
        timezone: session.location.timezone,
        atDate: session.startsAt,
      });
    }),
  );

  const lineItems = buildReservationLineItems(requestedItems, resolvedPrices);

  const reservation = await reservationRepository.create(tx, {
    sessionId: session.id,
    expiresAt: computeReservationExpiry(now),
    idempotencyKey,
    idempotencyPayloadHash: idempotencyKey ? hashIdempotencyPayload(input) : undefined,
    items: lineItems,
  });

  await recordAuditLog(tx, {
    action: "RESERVATION_CREATED",
    entityType: "Reservation",
    entityId: reservation.id,
    metadata: { sessionId: session.id, totalRequested },
  });

  return reservation;
}

/**
 * Looks up a reservation by its public-safe id, including its line items.
 * Lazily flips a stale PENDING reservation to EXPIRED so callers always see
 * an up-to-date status without waiting for the background sweep.
 */
export async function getReservationByPublicId(
  publicId: string,
): Promise<ReservationWithItems | null> {
  const reservation = await reservationRepository.findByPublicId(prisma, publicId);
  if (!reservation) return null;

  if (reservation.status === "PENDING" && reservation.expiresAt.getTime() <= Date.now()) {
    return reservationRepository.markExpired(prisma, reservation.id);
  }

  return reservation;
}
