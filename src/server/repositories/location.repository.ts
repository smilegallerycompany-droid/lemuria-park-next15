import type { DbClient } from "@/lib/db/prisma";

/** Repository — raw Prisma data access for `Location`. No business logic. */
export const locationRepository = {
  findBySlug(db: DbClient, slug: string) {
    return db.location.findFirst({ where: { slug, status: { in: ["ACTIVE", "UPCOMING"] } } });
  },

  findDefaultActive(db: DbClient) {
    return db.location.findFirst({ where: { status: "ACTIVE" }, orderBy: { activeFrom: "asc" } });
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
