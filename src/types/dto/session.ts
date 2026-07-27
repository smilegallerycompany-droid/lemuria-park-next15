/** Public DTOs for GET /api/public/sessions. Never a Prisma model — safe to use in React. */

export type PublicSessionAvailabilityStatus = "AVAILABLE" | "LOW_AVAILABILITY" | "SOLD_OUT";

export interface PublicSessionPriceDto {
  ticketTypeCode: string;
  ticketTypeName: string;
  /** Kopecks — always server-computed for this session's actual date. */
  unitPrice: number;
}

export interface PublicSessionDto {
  publicId: string;
  startsAt: string;
  /** `YYYY-MM-DD`, in the location's own timezone. */
  localDate: string;
  /** `HH:MM`, in the location's own timezone. */
  localTime: string;
  capacity: number;
  remainingSeats: number;
  soldOut: boolean;
  status: PublicSessionAvailabilityStatus;
  prices: PublicSessionPriceDto[];
}

export interface PublicSessionsLocationDto {
  slug: string;
  city: string;
  venue: string;
  timezone: string;
}

export interface PublicSessionsResponseDto {
  location: PublicSessionsLocationDto;
  /** The `YYYY-MM-DD` date these sessions were listed for. */
  date: string;
  sessions: PublicSessionDto[];
}
