/** Public DTOs for GET /api/public/config. Never a Prisma model — safe to use in React. */

export interface SiteConfigSiteDto {
  name: string;
  subtitle: string;
  ctaLabel: string;
  sessionIntervalMinutes: number;
  capacity: number;
}

export interface SiteConfigContactDto {
  phone: string;
  complaintsPhone: string | null;
  email: string | null;
  supportHours: string | null;
}

export interface SiteConfigLocationDto {
  slug: string;
  name: string;
  city: string;
  address: string;
  status: string;
  phone: string | null;
  mapUrl: string | null;
  sessionIntervalMinutes: number;
  defaultCapacity: number;
  activeFrom: string | null;
  activeTo: string | null;
}

export interface SiteConfigTicketTypeDto {
  code: string;
  name: string;
  description: string | null;
  minAge: number | null;
  maxAge: number | null;
}

export interface SiteConfigDto {
  site: SiteConfigSiteDto;
  contact: SiteConfigContactDto | null;
  locations: SiteConfigLocationDto[];
  ticketTypes: SiteConfigTicketTypeDto[];
}
