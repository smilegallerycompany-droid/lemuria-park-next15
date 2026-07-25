/** Public DTOs for GET /api/public/sessions. Never a Prisma model — safe to use in React. */

export interface TicketPriceDto {
  ticketTypeCode: string;
  ticketTypeName: string;
  /** Kopecks — always server-computed. */
  unitPriceAmount: number;
}

export interface SessionDto {
  /** The session's public id (never the internal database id). */
  id: string;
  startsAt: string;
  status: string;
  capacity: number;
  available: number;
  prices: TicketPriceDto[];
}

export interface LocationSummaryDto {
  slug: string;
  name: string;
  city: string;
  timezone: string;
}

export interface SessionsResponseDto {
  location: LocationSummaryDto;
  sessions: SessionDto[];
}
