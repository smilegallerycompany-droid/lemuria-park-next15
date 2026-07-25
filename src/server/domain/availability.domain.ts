import { DomainError } from "@/server/domain/errors";

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

export function assertCapacity(availability: SessionAvailability, requestedQuantity: number): void {
  if (requestedQuantity > availability.available) {
    throw new DomainError(
      "INSUFFICIENT_CAPACITY",
      `Недостаточно свободных мест: доступно ${availability.available}, запрошено ${requestedQuantity}`,
      { available: availability.available, requested: requestedQuantity },
    );
  }
}
