import { prisma } from "@/lib/db/prisma";
import { recordAuditLog } from "@/lib/audit";
import { DomainError } from "@/server/domain/errors";
import { verifyPassword } from "@/server/auth/password";
import { createStaffSession, type StaffUser } from "@/server/auth/staff-session";
import type { UserRole } from "@prisma/client";

const GENERIC_AUTH_ERROR = "Неверный email или пароль";

export async function loginStaff(params: {
  email: string;
  password: string;
  allowedRoles: UserRole[];
  ip?: string | null;
  ua?: string | null;
}): Promise<StaffUser> {
  const email = params.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    include: { locations: { select: { locationId: true } } },
  });

  const passwordOk = user ? await verifyPassword(params.password, user.passwordHash) : false;

  if (!user || !passwordOk || user.status !== "ACTIVE" || !params.allowedRoles.includes(user.role)) {
    await recordAuditLog(prisma, {
      actorId: user?.id,
      action: "LOGIN_FAILED",
      entityType: "User",
      entityId: user?.id,
      metadata: { email },
      ipAddress: params.ip,
      userAgent: params.ua,
    });
    throw new DomainError("UNAUTHORIZED", GENERIC_AUTH_ERROR);
  }

  await createStaffSession({
    userId: user.id,
    ip: params.ip,
    ua: params.ua,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await recordAuditLog(prisma, {
    actorId: user.id,
    action: "LOGIN_SUCCESS",
    entityType: "User",
    entityId: user.id,
    ipAddress: params.ip,
    userAgent: params.ua,
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    locationIds: user.locations.map((l) => l.locationId),
  };
}
