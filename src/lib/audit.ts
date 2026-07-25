import type { Prisma } from "@prisma/client";
import type { DbClient } from "@/lib/db/prisma";

export interface AuditLogInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

/**
 * Records an audit trail entry for an admin/cashier/system action. Accepts a
 * transaction client so audit entries are written atomically with the
 * change they describe.
 */
export async function recordAuditLog(db: DbClient, input: AuditLogInput): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? undefined,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
