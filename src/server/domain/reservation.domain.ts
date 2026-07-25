import type { Reservation } from "@prisma/client";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import { DomainError } from "@/server/domain/errors";
import type { ResolvedPrice } from "@/server/domain/pricing.domain";

export interface ReservationLineItemInput {
  ticketTypeId: string;
  quantity: number;
  unitPriceAmount: number;
}

/**
 * ReservationDomain — pure rules about seat holds: how long they last,
 * whether they are still active, and how to turn resolved prices into the
 * line items that will be persisted.
 */

export function computeReservationExpiry(now: Date): Date {
  return new Date(now.getTime() + DOMAIN_CONFIG.reservationHoldMinutes * 60 * 1000);
}

export function isReservationExpired(
  reservation: Pick<Reservation, "expiresAt">,
  now: Date,
): boolean {
  return reservation.expiresAt.getTime() <= now.getTime();
}

export function isReservationActive(
  reservation: Pick<Reservation, "status" | "expiresAt">,
  now: Date,
): boolean {
  return reservation.status === "PENDING" && !isReservationExpired(reservation, now);
}

export function assertReservationFound(
  reservation: Reservation | null,
): asserts reservation is Reservation {
  if (!reservation) {
    throw new DomainError("RESERVATION_NOT_FOUND", "Резервирование не найдено");
  }
}

export function buildReservationLineItems(
  requested: { ticketTypeCode: string; quantity: number }[],
  priced: ResolvedPrice[],
): ReservationLineItemInput[] {
  const priceByCode = new Map(priced.map((price) => [price.ticketTypeCode, price]));
  return requested
    .filter((item) => item.quantity > 0)
    .map((item) => {
      const price = priceByCode.get(item.ticketTypeCode);
      if (!price) {
        throw new DomainError(
          "TICKET_TYPE_NOT_FOUND",
          `Не удалось определить цену для типа билета «${item.ticketTypeCode}»`,
        );
      }
      return {
        ticketTypeId: price.ticketTypeId,
        quantity: item.quantity,
        unitPriceAmount: price.unitPriceAmount,
      };
    });
}

export function sumRequestedQuantity(items: { quantity: number }[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
