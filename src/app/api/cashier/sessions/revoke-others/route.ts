import { apiSuccess, handleApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { requireCashier } from "@/server/auth/cashier-session";
import { revokeOtherUserSessions } from "@/server/auth/staff-session";
import { clientIpFromRequest } from "@/server/security/rate-limit";

export async function POST(req: Request) {
  try {
    const user = await requireCashier();
    const revoked = await revokeOtherUserSessions(user.id);
    await recordAuditLog(prisma, {
      actorId: user.id,
      action: "SESSIONS_REVOKED_OTHERS",
      entityType: "User",
      entityId: user.id,
      after: { revoked },
      ipAddress: clientIpFromRequest(req),
      userAgent: req.headers.get("user-agent"),
    });
    return apiSuccess({ revoked });
  } catch (error) {
    return handleApiError(error);
  }
}
