import { Prisma, type Reservation, type ReservationItem } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/response";
import { recordAuditLog } from "@/lib/audit";
import type { CreateReservationInput } from "@/lib/validation/reservation";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";
import { getSessionAvailability } from "@/server/services/availability";
import { findTicketTypeByCode, resolveTicketPrice } from "@/server/services/pricing";

/** How long a seat hold stays valid before it is considered expired. */
export const RESERVATION_HOLD_MINUTES = 15;

/** Number of times to retry a reservation creation on a transaction write conflict. */
const MAX_SERIALIZATION_RETRIES = 3;

export type ReservationWithItems = Reservation & { items: ReservationItem[] };

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/**
 * Creates a seat reservation for a session, enforcing:
 *  - the session must exist and currently accept bookings,
 *  - price is always resolved server-side (never trusts client input),
 *  - the requested quantity must fit within the session's remaining capacity,
 *  - the whole check-then-write runs inside a single Serializable
 *    transaction so concurrent requests can never oversell the same seats.
 *
 * If `idempotencyKey` is supplied and a reservation already exists for it,
 * that existing reservation is returned instead of creating a duplicate.
 */
export async function createReservation(
  input: CreateReservationInput,
): Promise<ReservationWithItems> {
  if (input.idempotencyKey) {
    const existing = await prisma.reservation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { items: true },
    });
    if (existing) {
      return existing;
    }
  }

  for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => createReservationInTransaction(tx, input), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const isLastAttempt = attempt === MAX_SERIALIZATION_RETRIES;
      if (isSerializationConflict(error) && !isLastAttempt) {
        continue;
      }
      throw error;
    }
  }

  // Unreachable — the loop above always returns or throws.
  throw new ApiError("INTERNAL_ERROR", "Не удалось создать резервирование", 500);
}

async function createReservationInTransaction(
  tx: DbClient,
  input: CreateReservationInput,
): Promise<ReservationWithItems> {
  const now = new Date();

  // Free up seats held by holds that have already expired before checking availability.
  await expireStaleReservations(tx, now);

  const session = await tx.session.findUnique({
    where: { publicId: input.sessionId },
    include: { location: true },
  });

  if (!session) {
    throw new ApiError("NOT_FOUND", "Сеанс не найден", 404);
  }

  if (session.status !== "SCHEDULED" && session.status !== "OPEN") {
    throw new ApiError("SESSION_UNAVAILABLE", "Сеанс недоступен для бронирования", 409);
  }

  if (session.startsAt.getTime() <= now.getTime()) {
    throw new ApiError("SESSION_UNAVAILABLE", "Сеанс уже начался или завершился", 409);
  }

  const requestedItems = input.items.filter((item) => item.quantity > 0);
  const totalRequested = requestedItems.reduce((sum, item) => sum + item.quantity, 0);

  const availability = await getSessionAvailability(tx, session.id, now);
  if (totalRequested > availability.available) {
    throw new ApiError(
      "SESSION_FULL",
      `Недостаточно свободных мест: доступно ${availability.available}, запрошено ${totalRequested}`,
      409,
      { available: availability.available, requested: totalRequested },
    );
  }

  const resolvedItems = await Promise.all(
    requestedItems.map(async (item) => {
      const ticketType = await findTicketTypeByCode(tx, item.ticketTypeCode);
      const price = await resolveTicketPrice(tx, {
        locationId: session.locationId,
        ticketTypeId: ticketType.id,
        timezone: session.location.timezone,
        atDate: session.startsAt,
      });
      return { ticketTypeId: ticketType.id, quantity: item.quantity, price };
    }),
  );

  const expiresAt = new Date(now.getTime() + RESERVATION_HOLD_MINUTES * 60 * 1000);

  const reservation = await tx.reservation.create({
    data: {
      sessionId: session.id,
      status: "PENDING",
      expiresAt,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail,
      idempotencyKey: input.idempotencyKey,
      items: {
        create: resolvedItems.map((item) => ({
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
          unitPriceAmount: item.price.unitPriceAmount,
        })),
      },
    },
    include: { items: true },
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
  return prisma.reservation.findUnique({
    where: { publicId },
    include: { items: true },
  });
}
