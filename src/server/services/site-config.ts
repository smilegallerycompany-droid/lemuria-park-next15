import { prisma } from "@/lib/db/prisma";
import { addDaysUtc, formatDateInTimezone, todayInTimezone } from "@/lib/datetime";
import { DOMAIN_CONFIG } from "@/server/domain/config";
import { DomainError } from "@/server/domain/errors";
import { resolveBookableLocation } from "@/server/domain/public-location";
import { locationRepository } from "@/server/repositories/location.repository";
import { ticketTypeRepository } from "@/server/repositories/ticket-type.repository";
import type { PublicConfigDto, PublicConfigLocationDto } from "@/types/dto/config";
import type { Location } from "@prisma/client";

function toLocationDto(location: Location): PublicConfigLocationDto {
  return {
    slug: location.slug,
    city: location.city,
    venue: location.name,
    address: location.address,
    timezone: location.timezone,
  };
}

function isWithinActiveWindow(location: Location, now: Date): boolean {
  if (location.activeFrom && location.activeFrom.getTime() > now.getTime()) return false;
  if (location.activeTo && location.activeTo.getTime() < now.getTime()) return false;
  return true;
}

export async function getPublicSiteConfig(locationSlug?: string): Promise<PublicConfigDto> {
  const now = new Date();
  const active = (await locationRepository.listActive(prisma, now)).filter((loc) =>
    isWithinActiveWindow(loc, now),
  );

  const resolved = resolveBookableLocation({ slug: locationSlug, active });
  if (resolved.kind === "not-found" && locationSlug) {
    throw new DomainError("LOCATION_NOT_FOUND", "Локация не найдена");
  }
  const selected = resolved.kind === "ok" ? resolved.location : null;

  const [contact, ticketTypes, settings] = await Promise.all([
    prisma.contactSettings.findFirst({ orderBy: { createdAt: "asc" } }),
    ticketTypeRepository.listActive(prisma),
    prisma.siteSettings.findFirst({ orderBy: { createdAt: "asc" } }),
  ]);

  const closedSchedules = selected
    ? await prisma.locationSchedule.findMany({
        where: { locationId: selected.id, isClosed: true },
        select: { dayOfWeek: true },
      })
    : [];

  const timezone = selected?.timezone ?? settings?.defaultTimezone ?? "Europe/Moscow";
  const todayLocal = todayInTimezone(timezone, now);
  const lookaheadEnd = formatDateInTimezone(
    addDaysUtc(now, DOMAIN_CONFIG.sessionsLookaheadDays),
    timezone,
  );
  const activeFromLocal = selected?.activeFrom
    ? formatDateInTimezone(selected.activeFrom, timezone)
    : null;
  const activeToLocal = selected?.activeTo
    ? formatDateInTimezone(selected.activeTo, timezone)
    : null;
  const from =
    activeFromLocal && activeFromLocal > todayLocal ? activeFromLocal : todayLocal;
  const to = activeToLocal ?? lookaheadEnd;

  const ticketTypeDtos = ticketTypes.map((ticketType) => ({
    code: ticketType.code,
    name: ticketType.name,
    description: ticketType.description,
    minAge: ticketType.minAge,
    maxAge: ticketType.maxAge,
  }));

  return {
    location: selected ? toLocationDto(selected) : null,
    locations: active.map(toLocationDto),
    availableDateRange: { from, to },
    closedWeekdays: closedSchedules.map((row) => row.dayOfWeek),
    ticketTypes: ticketTypeDtos,
    displayRules: {
      sessionIntervalMinutes: selected?.sessionIntervalMinutes ?? 30,
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
