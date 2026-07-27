import { DomainError } from "@/server/domain/errors";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import type { PublicSessionAvailabilityStatus } from "@/types/dto/session";

export interface SessionAvailability {
  sessionId: string;
  capacity: number;
  /** Seats currently held by active reservations + confirmed/awaiting orders. */
  booked: number;
  available: number;
}

/**
 * AvailabilityDomain — pure seat-capacity math. The repository layer
 * aggregates how many seats are already held (by reservations and by
 * orders, across both online and cashier channels); this layer just does
 * the arithmetic and enforces the "never oversell" rule.
 */

export function computeAvailability(params: {
  sessionId: string;
  capacity: number;
  reservedQuantity: number;
  orderedQuantity: number;
}): SessionAvailability {
  const booked = params.reservedQuantity + params.orderedQuantity;
  return {
    sessionId: params.sessionId,
    capacity: params.capacity,
    booked,
    available: Math.max(0, params.capacity - booked),
  };
}

/**
 * Throws `SESSION_SOLD_OUT` when there is no capacity left at all, or
 * `INSUFFICIENT_CAPACITY` when some seats remain but fewer than requested.
 * Kept as two distinct codes because the client can react differently
 * (sold out ⇒ hide the session; insufficient ⇒ suggest a smaller quantity).
 */
export function assertCapacity(availability: SessionAvailability, requestedQuantity: number): void {
  if (availability.available <= 0) {
    throw new DomainError("SESSION_SOLD_OUT", "На этот сеанс уже нет свободных мест", {
      available: availability.available,
      requested: requestedQuantity,
    });
  }
  if (requestedQuantity > availability.available) {
    throw new DomainError(
      "INSUFFICIENT_CAPACITY",
      `Недостаточно свободных мест: доступно ${availability.available}, запрошено ${requestedQuantity}`,
      { available: availability.available, requested: requestedQuantity },
    );
  }
}

/**
 * Pure UI-facing classification of remaining seats. Does not affect any
 * capacity/overselling rule — see `DOMAIN_CONFIG.lowAvailabilityThreshold`.
 */
export function classifySessionAvailability(
  remainingSeats: number,
): PublicSessionAvailabilityStatus {
  if (remainingSeats <= 0) return "SOLD_OUT";
  if (remainingSeats <= DOMAIN_CONFIG.lowAvailabilityThreshold) return "LOW_AVAILABILITY";
  return "AVAILABLE";
}
