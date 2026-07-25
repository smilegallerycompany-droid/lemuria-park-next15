import { prisma } from "@/lib/db/prisma";
import { locationRepository } from "@/server/repositories/location.repository";
import { ticketTypeRepository } from "@/server/repositories/ticket-type.repository";
import type { SiteConfigDto } from "@/types/dto/config";

/**
 * SiteConfigService — assembles the public site configuration (brand
 * strings, contact info, active/upcoming locations, active ticket types),
 * entirely from the database. Never includes `visitDurationMinutes`.
 */
export async function getPublicSiteConfig(): Promise<SiteConfigDto> {
  const [settings, contact, locations, ticketTypes] = await Promise.all([
    prisma.siteSettings.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.contactSettings.findFirst({ orderBy: { createdAt: "asc" } }),
    locationRepository.listPublic(prisma),
    ticketTypeRepository.listActive(prisma),
  ]);

  return {
    site: {
      name: settings?.siteName ?? "Лемурия Парк",
      subtitle: settings?.siteSubtitle ?? "Зоотеатр лемуров",
      ctaLabel: settings?.ctaLabel ?? "Купить билет",
      sessionIntervalMinutes: settings?.defaultSessionInterval ?? 30,
      capacity: settings?.defaultCapacity ?? 15,
    },
    contact: contact
      ? {
          phone: contact.phone,
          complaintsPhone: contact.complaintsPhone,
          email: contact.email,
          supportHours: contact.supportHours,
        }
      : null,
    locations: locations.map((location) => ({
      slug: location.slug,
      name: location.name,
      city: location.city,
      address: location.address,
      status: location.status,
      phone: location.phone,
      mapUrl: location.mapUrl,
      sessionIntervalMinutes: location.sessionIntervalMinutes,
      defaultCapacity: location.defaultCapacity,
      activeFrom: location.activeFrom?.toISOString() ?? null,
      activeTo: location.activeTo?.toISOString() ?? null,
    })),
    ticketTypes: ticketTypes.map((ticketType) => ({
      code: ticketType.code,
      name: ticketType.name,
      description: ticketType.description,
      minAge: ticketType.minAge,
      maxAge: ticketType.maxAge,
    })),
  };
}
