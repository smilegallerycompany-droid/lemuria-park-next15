import type { DbClient } from "@/lib/db/prisma";

/** Repository — raw Prisma data access for `TicketType`. No business logic. */
export const ticketTypeRepository = {
  findByCode(db: DbClient, code: string) {
    return db.ticketType.findUnique({ where: { code } });
  },

  findById(db: DbClient, id: string) {
    return db.ticketType.findUnique({ where: { id } });
  },

  findManyByIds(db: DbClient, ids: string[]) {
    return db.ticketType.findMany({ where: { id: { in: ids } } });
  },

  listActive(db: DbClient) {
    return db.ticketType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  },
};
