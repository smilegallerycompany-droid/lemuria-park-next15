import { prisma } from "@/lib/db/prisma";
import { addDaysUtc, formatDateInTimezone, todayInTimezone } from "@/lib/datetime";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import { DomainError } from "@/server/domain/errors";
import { locationRepository } from "@/server/repositories/location.repository";
import { ticketTypeRepository } from "@/server/repositories/ticket-type.repository";
import type { PublicConfigDto } from "@/types/dto/config";

/**
 * SiteConfigService — assembles the public site configuration (the single
 * currently-active Location, brand strings, contact info, active ticket
 * types) entirely from the database. Never includes `visitDurationMinutes`,
 * internal ids, or a single "eternal" price — ticket-type prices vary by
 * date, so the client asks GET /api/public/sessions for those.
 */
export async function getPublicSiteConfig(): Promise<PublicConfigDto> {
  const now = new Date();
  const location = await locationRepository.findDefaultActive(prisma, now);

  if (!location) {
    throw new DomainError("CONFIG_NOT_FOUND", "Активная локация не найдена");
  }

  const [contact, ticketTypes] = await Promise.all([
    prisma.contactSettings.findFirst({ orderBy: { createdAt: "asc" } }),
    ticketTypeRepository.listActive(prisma),
  ]);

  const settings = await prisma.siteSettings.findFirst({ orderBy: { createdAt: "asc" } });

  const todayLocal = todayInTimezone(location.timezone, now);
  const lookaheadEnd = formatDateInTimezone(
    addDaysUtc(now, DOMAIN_CONFIG.sessionsLookaheadDays),
    location.timezone,
  );
  const activeToLocal = location.activeTo
    ? formatDateInTimezone(location.activeTo, location.timezone)
    : null;

  return {
    location: {
      slug: location.slug,
      city: location.city,
      venue: location.name,
      address: location.address,
      timezone: location.timezone,
    },
    availableDateRange: {
      from: todayLocal,
      to: activeToLocal && activeToLocal < lookaheadEnd ? activeToLocal : lookaheadEnd,
    },
    ticketTypes: ticketTypes.map((ticketType) => ({
      code: ticketType.code,
      name: ticketType.name,
      description: ticketType.description,
      minAge: ticketType.minAge,
      maxAge: ticketType.maxAge,
    })),
    displayRules: {
      sessionIntervalMinutes: location.sessionIntervalMinutes,
      lowAvailabilityThreshold: DOMAIN_CONFIG.lowAvailabilityThreshold,
    },
    site: {
      name: settings?.siteName ?? "Лемурия Парк",
      subtitle: settings?.siteSubtitle ?? "Зоотеатр лемуров",
      ctaLabel: settings?.ctaLabel ?? "Купить билет",
    },
    contact: contact
      ? {
          phone: contact.phone,
          complaintsPhone: contact.complaintsPhone,
          email: contact.email,
          supportHours: contact.supportHours,
        }
      : null,
  };
}
