/** Public DTOs for GET /api/public/config. Never a Prisma model — safe to use in React. */

export interface PublicTicketTypeDto {
  code: string;
  name: string;
  description: string | null;
  minAge: number | null;
  maxAge: number | null;
}

export interface PublicConfigLocationDto {
  slug: string;
  city: string;
  venue: string;
  address: string;
  timezone: string;
}

export interface PublicConfigContactDto {
  phone: string;
  complaintsPhone: string | null;
  email: string | null;
  supportHours: string | null;
}

export interface PublicConfigDisplayRulesDto {
  sessionIntervalMinutes: number;
  /** A session with this many seats or fewer left is shown as "low availability". */
  lowAvailabilityThreshold: number;
}

export interface PublicConfigDto {
  location: PublicConfigLocationDto;
  /** Inclusive `YYYY-MM-DD` window the public date picker should offer. */
  availableDateRange: { from: string; to: string };
  /** Weekdays when the venue is closed (e.g. `TUESDAY`). */
  closedWeekdays: Array<
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY"
  >;
  ticketTypes: PublicTicketTypeDto[];
  displayRules: PublicConfigDisplayRulesDto;
  site: { name: string; subtitle: string; ctaLabel: string };
  contact: PublicConfigContactDto | null;
}
