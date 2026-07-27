import type { DbClient } from "@/lib/db/prisma";

/** Repository — raw Prisma data access for `Location`. No business logic. */
export const locationRepository = {
  findBySlug(db: DbClient, slug: string) {
    return db.location.findFirst({ where: { slug, status: { in: ["ACTIVE", "UPCOMING"] } } });
  },

  /**
   * The one location the public site currently points to: status ACTIVE
   * and — if set — the given instant falls within [activeFrom, activeTo].
   * Supports the touring-exhibition model where locations are activated
   * and deactivated in sequence as the show moves between cities.
   */
  findDefaultActive(db: DbClient, now: Date = new Date()) {
    return db.location.findFirst({
      where: {
        status: "ACTIVE",
        AND: [
          { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
          { OR: [{ activeTo: null }, { activeTo: { gte: now } }] },
        ],
      },
      orderBy: { activeFrom: "asc" },
    });
  },

  listPublic(db: DbClient) {
    return db.location.findMany({
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
    });
  },
};
