/** Public DTOs for the reservation endpoints. Never a Prisma model — safe to use in React. */

export interface ReservationSessionDto {
  startsAt: string;
  locationName: string;
  locationCity: string;
  locationSlug: string;
  locationTimezone: string;
}

export interface ReservationLineItemDto {
  ticketTypeCode: string;
  ticketTypeName: string;
  quantity: number;
  unitPriceAmount: number;
  subtotalAmount: number;
}

export interface ReservationCustomerDto {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface ReservationDto {
  /** The reservation's public id (never the internal database id). */
  id: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  session: ReservationSessionDto | null;
  customer: ReservationCustomerDto;
  items: ReservationLineItemDto[];
  totalAmount: number;
  currency: string;
}
