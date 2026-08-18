import { prisma } from "@/lib/db/prisma";
import { formatDateInTimezone } from "@/lib/datetime";

export type PublicLocationPayload = {
  sectionTitle: string;
  locations: Array<{
    slug: string;
    name: string;
    city: string;
    address: string;
    addressLine2: string | null;
    phone: string | null;
    email: string | null;
    latitude: number | null;
    longitude: number | null;
    mapZoom: number;
    mapLabel: string | null;
    routeUrl: string | null;
    mapUrl: string | null;
    scheduleSummary: string | null;
    nextSessions: Array<{ localDate: string; localTime: string; remainingSeats: number }>;
  }>;
};

const DAY_RU: Record<string, string> = {
  MONDAY: "Пн",
  TUESDAY: "Вт",
  WEDNESDAY: "Ср",
  THURSDAY: "Чт",
  FRIDAY: "Пт",
  SATURDAY: "Сб",
  SUNDAY: "Вс",
};

export async function getPublicLocationsPayload(): Promise<PublicLocationPayload> {
  const settings = await prisma.siteSettings.findFirst({ orderBy: { createdAt: "asc" } });
  const locations = await prisma.location.findMany({
    where: { status: { in: ["ACTIVE", "UPCOMING"] } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      schedules: { orderBy: { dayOfWeek: "asc" } },
    },
  });

  const now = new Date();
  const enriched = await Promise.all(
    locations.map(async (loc) => {
      const openDays = loc.schedules.filter((s) => !s.isClosed);
      const summary =
        openDays.length > 0
          ? `${openDays.map((d) => DAY_RU[d.dayOfWeek] ?? d.dayOfWeek).join(", ")} · ${openDays[0]!.opensAt}–${openDays[0]!.closesAt}`
          : null;

      const sessions = await prisma.session.findMany({
        where: {
          locationId: loc.id,
          status: { in: ["SCHEDULED", "OPEN"] },
          startsAt: { gte: now },
        },
        orderBy: { startsAt: "asc" },
        take: 6,
      });

      const nextSessions = sessions.map((s) => ({
        localDate: formatDateInTimezone(s.startsAt, loc.timezone),
        localTime: new Intl.DateTimeFormat("ru-RU", {
          timeZone: loc.timezone,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(s.startsAt),
        remainingSeats: s.capacity,
      }));

      return {
        slug: loc.slug,
        name: loc.name,
        city: loc.city,
        address: loc.address,
        addressLine2: loc.addressLine2,
        phone: loc.phone,
        email: loc.email,
        latitude: loc.latitude,
        longitude: loc.longitude,
        mapZoom: loc.mapZoom,
        mapLabel: loc.mapLabel,
        routeUrl: loc.routeUrl,
        mapUrl: loc.mapUrl,
        scheduleSummary: summary,
        nextSessions,
      };
    }),
  );

  return {
    sectionTitle: settings?.locationSectionTitle ?? "Где мы находимся?",
    locations: enriched,
  };
}
