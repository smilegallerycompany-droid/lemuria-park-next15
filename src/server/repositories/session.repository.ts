import type { SessionStatus } from "@prisma/client";
import type { DbClient } from "@/lib/db/prisma";

/** Repository — raw Prisma data access for `Session`. No business logic. */
export const sessionRepository = {
  findByPublicId(db: DbClient, publicId: string) {
    return db.session.findUnique({ where: { publicId }, include: { location: true } });
  },

  findById(db: DbClient, id: string) {
    return db.session.findUnique({ where: { id } });
  },

  findManyByIds(db: DbClient, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return db.session.findMany({ where: { id: { in: ids } } });
  },

  listCandidates(
    db: DbClient,
    params: { locationId: string; statuses: SessionStatus[]; from: Date; to: Date; take: number },
  ) {
    return db.session.findMany({
      where: {
        locationId: params.locationId,
        status: { in: params.statuses },
        startsAt: { gte: params.from, lte: params.to },
      },
      orderBy: { startsAt: "asc" },
      take: params.take,
    });
  },

  /** Pessimistically locks a single Session row for the duration of the current transaction. */
  async lockForUpdate(tx: DbClient, sessionId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${sessionId} FOR UPDATE`;
  },
};
