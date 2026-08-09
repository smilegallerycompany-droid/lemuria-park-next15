import { prisma } from "@/lib/db/prisma";

export type SessionOccupancyStatus = "AVAILABLE" | "LOW" | "SOLD_OUT" | "CLOSED";

export function sessionOccupancyStatus(params: {
  capacity: number;
  sold: number;
  reserved: number;
  sessionStatus: string;
  startsAt: Date;
  now?: Date;
}): SessionOccupancyStatus {
  const now = params.now ?? new Date();
  if (
    params.sessionStatus === "CLOSED" ||
    params.sessionStatus === "CANCELLED" ||
    params.sessionStatus === "COMPLETED" ||
    params.startsAt.getTime() < now.getTime()
  ) {
    return "CLOSED";
  }
  const free = params.capacity - params.sold - params.reserved;
  if (free <= 0) return "SOLD_OUT";
  if (params.capacity > 0 && free / params.capacity <= 0.2) return "LOW";
  return "AVAILABLE";
}

export async function getUpcomingSessionsForDirector(params?: {
  locationIds?: string[];
  take?: number;
}) {
  const take = params?.take ?? 8;
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: {
      startsAt: { gte: now },
      ...(params?.locationIds?.length ? { locationId: { in: params.locationIds } } : {}),
    },
    orderBy: { startsAt: "asc" },
    take,
    include: {
      location: { select: { id: true, name: true, city: true } },
      tickets: { where: { status: { in: ["VALID", "USED"] } }, select: { id: true } },
      reservations: {
        where: { status: "PENDING", expiresAt: { gt: now } },
        include: { items: { select: { quantity: true } } },
      },
    },
  });

  return sessions.map((s) => {
    const sold = s.tickets.length;
    const reserved = s.reservations.reduce(
      (sum, r) => sum + r.items.reduce((q, i) => q + i.quantity, 0),
      0,
    );
    const free = Math.max(0, s.capacity - sold - reserved);
    const occupancy = s.capacity > 0 ? sold / s.capacity : 0;
    const status = sessionOccupancyStatus({
      capacity: s.capacity,
      sold,
      reserved,
      sessionStatus: s.status,
      startsAt: s.startsAt,
      now,
    });
    return {
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      location: s.location,
      capacity: s.capacity,
      sold,
      reserved,
      free,
      occupancy,
      status,
    };
  });
}
