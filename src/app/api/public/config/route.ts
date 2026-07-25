import { prisma } from "@/lib/db/prisma";
import { apiSuccess, handleApiError } from "@/lib/api/response";

/**
 * Public site configuration: brand strings, contact info, active/upcoming
 * locations and ticket types — all sourced from the database, never
 * hardcoded. Deliberately never includes `visitDurationMinutes`.
 */
export async function GET() {
  try {
    const [settings, contact, locations, ticketTypes] = await Promise.all([
      prisma.siteSettings.findFirst({ orderBy: { createdAt: "asc" } }),
      prisma.contactSettings.findFirst({ orderBy: { createdAt: "asc" } }),
      prisma.location.findMany({
        where: { status: { in: ["ACTIVE", "UPCOMING"] } },
        orderBy: [{ status: "asc" }, { activeFrom: "asc" }],
        select: {
          slug: true,
          name: true,
          city: true,
          address: true,
          status: true,
          phone: true,
          mapUrl: true,
          sessionIntervalMinutes: true,
          defaultCapacity: true,
          activeFrom: true,
          activeTo: true,
        },
      }),
      prisma.ticketType.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { code: true, name: true, description: true, minAge: true, maxAge: true },
      }),
    ]);

    return apiSuccess({
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
      locations,
      ticketTypes,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
