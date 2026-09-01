import { z } from "zod";
import { randomBytes } from "node:crypto";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector, revokeAllUserSessions } from "@/server/auth/staff-session";
import { hashPassword } from "@/server/auth/password";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";
import { assertCanAssignRole } from "@/server/auth/role-policy";

const patchSchema = z.object({
  confirm: z.literal(true).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  name: z.string().min(1).optional(),
  role: z.enum(["CASHIER", "ADMIN"]).optional(),
  locationIds: z.array(z.string()).optional(),
  resetPassword: z.boolean().optional(),
  newPassword: z.string().min(8).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

function tempPassword(): string {
  return `Tmp-${randomBytes(4).toString("hex")}!1`;
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { id } = await context.params;
    const before = await prisma.user.findUnique({
      where: { id },
      include: { locations: true },
    });
    if (!before) {
      throw new ApiError("NOT_FOUND", "Сотрудник не найден", 404);
    }
    if (before.role === "OWNER" && actor.role !== "OWNER") {
      throw new ApiError("FORBIDDEN", "Нельзя изменять владельца", 403);
    }

    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = patchSchema.parse(json);
    const meta = requestMeta(req);

    const needsConfirm =
      input.status === "DISABLED" || input.resetPassword === true || input.locationIds !== undefined;
    if (needsConfirm && input.confirm !== true) {
      throw new ApiError("VALIDATION_ERROR", "Подтвердите действие (confirm: true)", 400);
    }

    let generatedPassword: string | undefined;
    const data: {
      status?: "ACTIVE" | "DISABLED";
      name?: string;
      role?: "CASHIER" | "ADMIN";
      passwordHash?: string;
    } = {};

    if (input.status) data.status = input.status;
    if (input.name) data.name = input.name;
    if (input.role) {
      assertCanAssignRole(actor.role, input.role);
      data.role = input.role;
    }

    if (input.resetPassword) {
      generatedPassword = input.newPassword ?? tempPassword();
      data.passwordHash = await hashPassword(generatedPassword);
      await revokeAllUserSessions(id);
    }

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
        if (input.locationIds.length > 0) {
          await tx.userLocation.createMany({
            data: input.locationIds.map((locationId) => ({ userId: id, locationId })),
          });
        }
      }

      return updated;
    });

    const locations = await prisma.userLocation.findMany({
      where: { userId: id },
      include: { location: { select: { id: true, name: true } } },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: input.resetPassword
        ? "STAFF_RESET_PASSWORD"
        : input.status === "DISABLED"
          ? "STAFF_DISABLE"
          : "STAFF_UPDATE",
      entityType: "User",
      entityId: id,
      before: {
        id: before.id,
        email: before.email,
        name: before.name,
        role: before.role,
        status: before.status,
      },
      after: { ...user, locations },
      metadata: generatedPassword ? { temporaryPasswordIssued: true } : undefined,
      ...meta,
    });

    return apiSuccess({
      user: { ...user, locations },
      ...(generatedPassword ? { temporaryPassword: generatedPassword } : {}),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
