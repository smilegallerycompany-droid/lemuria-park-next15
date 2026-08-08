import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin, revokeAllUserSessions } from "@/server/auth/staff-session";
import { assertCanAssignRole, assertCanModifyUser } from "@/server/auth/role-policy";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";
import type { UserRole } from "@prisma/client";

const patchSchema = z.object({
  confirm: z.literal(true).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  name: z.string().min(1).optional(),
  role: z.enum(["CASHIER", "DIRECTOR", "ADMIN", "OWNER"]).optional(),
  locationIds: z.array(z.string()).optional(),
  resetPassword: z.boolean().optional(),
  newPassword: z.string().min(8).optional(),
  revokeSessions: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: Ctx) {
  try {
    const actor = await requireAdmin();
    const { id } = await context.params;
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw new ApiError("NOT_FOUND", "Пользователь не найден", 404);

    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = patchSchema.parse(json);

    assertCanModifyUser({
      actorRole: actor.role,
      actorId: actor.id,
      targetRole: before.role,
      targetId: before.id,
      nextRole: input.role as UserRole | undefined,
    });

    if (input.role === "OWNER" && actor.role !== "OWNER") {
      throw new ApiError("FORBIDDEN", "Нельзя назначить OWNER", 403);
    }

    if (before.role === "OWNER" && (input.status === "DISABLED" || input.role)) {
      const owners = await prisma.user.count({ where: { role: "OWNER", status: "ACTIVE" } });
      if (owners <= 1) {
        throw new ApiError("FORBIDDEN", "Нельзя оставить систему без OWNER", 403);
      }
    }

    if (input.role) assertCanAssignRole(actor.role, input.role as UserRole);

    const needsConfirm =
      input.status === "DISABLED" ||
      input.resetPassword === true ||
      input.revokeSessions === true ||
      input.locationIds !== undefined ||
      input.role !== undefined;
    if (needsConfirm && input.confirm !== true) {
      throw new ApiError("VALIDATION_ERROR", "Подтвердите действие (confirm: true)", 400);
    }

    const data: {
      status?: "ACTIVE" | "DISABLED";
      name?: string;
      role?: UserRole;
      passwordHash?: string;
    } = {};
    if (input.status) data.status = input.status;
    if (input.name) data.name = input.name;
    if (input.role) data.role = input.role as UserRole;
    if (input.resetPassword) {
      if (!input.newPassword) throw new ApiError("VALIDATION_ERROR", "Нужен newPassword", 400);
      data.passwordHash = await bcrypt.hash(input.newPassword, 12);
      await revokeAllUserSessions(id);
    }
    if (input.revokeSessions) await revokeAllUserSessions(id);

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          lastLoginAt: true,
        },
      });
      if (input.locationIds) {
        await tx.userLocation.deleteMany({ where: { userId: id } });
        if (input.locationIds.length) {
          await tx.userLocation.createMany({
            data: input.locationIds.map((locationId) => ({ userId: id, locationId })),
          });
        }
      }
      return updated;
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "ADMIN_USER_UPDATE",
      entityType: "User",
      entityId: id,
      before: { role: before.role, status: before.status },
      after: { role: user.role, status: user.status },
      ...requestMeta(req),
    });

    return apiSuccess({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
