/**
 * All "magic numbers" and tunable business rules for the booking domain live
 * here, in one place, instead of being scattered across services/routes.
 */
export const DOMAIN_CONFIG = {
  /** How long a seat hold (Reservation) stays valid before it expires. */
  reservationHoldMinutes: 15,
  /** Max number of distinct ticket-type line items allowed in one reservation. */
  maxReservationLineItems: 20,
  /** Max quantity allowed for a single ticket-type line item. */
  maxQuantityPerLineItem: 50,
  /** Retries for a `Serializable` transaction write conflict (Prisma P2034). */
  maxSerializationRetries: 3,
  /** Retries for an order-number collision (extremely unlikely, still handled). */
  maxOrderNumberRetries: 3,
  /** Public order number prefix, e.g. "LP-A1B2C3D4". */
  orderNumberPrefix: "LP",
  /** Number of random hex characters appended to the order number prefix. */
  orderNumberRandomLength: 8,
  /** How many days ahead the public sessions listing looks, when no date filter is given. */
  sessionsLookaheadDays: 14,
  /** Hard cap on how many sessions a single listing request can return. */
  maxSessionsPerQuery: 200,
} as const;
