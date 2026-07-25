import { Prisma, type Reservation, type ReservationItem } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import { assertSessionBookable } from "@/server/domain/session.domain";
import { assertCapacity } from "@/server/domain/availability.domain";
import {
  buildReservationLineItems,
  computeReservationExpiry,
  sumRequestedQuantity,
} from "@/server/domain/reservation.domain";
import { sessionRepository } from "@/server/repositories/session.repository";
import { reservationRepository } from "@/server/repositories/reservation.repository";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";
import { getSessionAvailability } from "@/server/services/availability";
import { findTicketTypeByCode, resolveTicketPrice } from "@/server/services/pricing";
import type { CreateReservationInput } from "@/lib/validation/reservation";

export type ReservationWithItems = Reservation & { items: ReservationItem[] };

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
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
 *    transaction, retried on write conflicts, so concurrent requests can
 *    never oversell the same seats.
 *
 * If `idempotencyKey` is supplied and a reservation already exists for it,
 * that existing reservation is returned instead of creating a duplicate.
 */
export async function createReservation(
  input: CreateReservationInput,
): Promise<ReservationWithItems> {
  if (input.idempotencyKey) {
    const existing = await reservationRepository.findByIdempotencyKey(
      prisma,
      input.idempotencyKey,
    );
    if (existing) {
      return existing;
    }
  }

  for (let attempt = 1; attempt <= DOMAIN_CONFIG.maxSerializationRetries; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => createReservationInTransaction(tx, input),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const isLastAttempt = attempt === DOMAIN_CONFIG.maxSerializationRetries;
      if (isSerializationConflict(error) && !isLastAttempt) {
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
): Promise<ReservationWithItems> {
  const now = new Date();

  // Free up seats held by holds that have already expired before checking availability.
  await expireStaleReservations(tx, now);

  const session = await sessionRepository.findByPublicId(tx, input.sessionId);
  assertSessionBookable(session, now);

  const requestedItems = input.items.filter((item) => item.quantity > 0);
  const totalRequested = sumRequestedQuantity(requestedItems);

  const availability = await getSessionAvailability(tx, session.id, now);
  assertCapacity(availability, totalRequested);

  const resolvedPrices = await Promise.all(
    requestedItems.map(async (item) => {
      const ticketType = await findTicketTypeByCode(tx, item.ticketTypeCode);
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
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    idempotencyKey: input.idempotencyKey,
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

/** Looks up a reservation by its public-safe id, including its line items. */
export async function getReservationByPublicId(
  publicId: string,
): Promise<ReservationWithItems | null> {
  return reservationRepository.findByPublicId(prisma, publicId);
}
