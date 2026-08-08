import { z } from "zod";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { requireCashier } from "@/server/auth/cashier-session";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { revokeOtherUserSessions } from "@/server/auth/staff-session";
import { DomainError } from "@/server/domain/errors";
import { clientIpFromRequest, consumeRateLimit } from "@/server/security/rate-limit";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128),
  confirmPassword: z.string().min(10).max(128),
});

export async function POST(req: Request) {
  try {
    const user = await requireCashier();
    const ip = clientIpFromRequest(req);
    const limited = consumeRateLimit(`cashier-password:${user.id}:${ip}`, {
      limit: 5,
      windowMs: 15 * 60_000,
    });
    if (!limited.allowed) {
      throw new DomainError("RATE_LIMITED", "Слишком много попыток. Попробуйте позже.");
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Некорректные данные пароля", 400);
    }

    const { currentPassword, newPassword, confirmPassword } = parsed.data;
    if (newPassword !== confirmPassword) {
      return apiError("VALIDATION_ERROR", "Новый пароль и подтверждение не совпадают", 400);
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true, status: true },
    });
    if (!dbUser || dbUser.status !== "ACTIVE") {
      return apiError("FORBIDDEN", "Аккаунт недоступен", 403);
    }

    const ok = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!ok) {
      return apiError("UNAUTHORIZED", "Неверный текущий пароль", 401);
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    const revoked = await revokeOtherUserSessions(user.id);
    await recordAuditLog(prisma, {
      actorId: user.id,
      action: "PASSWORD_CHANGED",
      entityType: "User",
      entityId: user.id,
      after: { revokedOtherSessions: revoked },
      ipAddress: ip,
      userAgent: req.headers.get("user-agent"),
    });

    return apiSuccess({ ok: true, revokedOtherSessions: revoked });
  } catch (error) {
    return handleApiError(error);
  }
}
