/** Public DTOs for the order endpoints. Never a Prisma model — safe to use in React. */

export interface OrderSessionDto {
  startsAt: string;
  locationName: string;
  locationCity: string;
  locationSlug: string;
  locationTimezone: string;
}

export interface OrderLineItemDto {
  ticketTypeCode: string;
  ticketTypeName: string;
  quantity: number;
  unitPriceAmount: number;
  subtotalAmount: number;
}

export interface OrderCustomerDto {
  name: string;
  phone: string;
  email: string;
}

export interface OrderDto {
  /** Safe, human-friendly, non-guessable identifier (never the internal database id). */
  number: string;
  status: string;
  source: string;
  createdAt: string;
  session: OrderSessionDto | null;
  customer: OrderCustomerDto;
  items: OrderLineItemDto[];
  totalAmount: number;
  currency: string;
}
