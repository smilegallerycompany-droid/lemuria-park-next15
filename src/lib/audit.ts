import type { Prisma } from "@prisma/client";
import type { DbClient } from "@/lib/db/prisma";

export interface AuditLogInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const SENSITIVE_KEY =
  /^(password|passwordhash|passwd|secret|token|authorization|cookie|apikey|api_key|qrToken|qrtoken|rawPassword)$/i;

/**
 * Strips password/secret fields from audit JSON so credentials never land in AuditLog.
 */
export function sanitizeAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null as unknown as Prisma.InputJsonValue;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditJson(item) ?? null) as Prisma.InputJsonValue;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeAuditJson(nested);
    }
    return out as Prisma.InputJsonValue;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
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
      before: sanitizeAuditJson(input.before) ?? undefined,
      after: sanitizeAuditJson(input.after) ?? undefined,
      metadata: sanitizeAuditJson(input.metadata) ?? undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
