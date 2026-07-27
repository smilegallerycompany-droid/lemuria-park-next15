/** Public DTOs for the reservation endpoints. Never a Prisma model — safe to use in React. */

export interface PublicReservationSessionDto {
  publicId: string;
  startsAt: string;
  localDate: string;
  localTime: string;
  city: string;
  venue: string;
  address: string;
  timezone: string;
}

export interface PublicReservationItemDto {
  ticketTypeCode: string;
  ticketTypeName: string;
  quantity: number;
  /** Kopecks. */
  unitPrice: number;
  /** Kopecks — `quantity * unitPrice`. */
  subtotal: number;
}

export interface PublicReservationDto {
  /** The reservation's public id (never the internal database id). */
  publicId: string;
  status: string;
  expiresAt: string;
  session: PublicReservationSessionDto;
  items: PublicReservationItemDto[];
  totalQuantity: number;
  /** Kopecks. */
  totalAmount: number;
}
