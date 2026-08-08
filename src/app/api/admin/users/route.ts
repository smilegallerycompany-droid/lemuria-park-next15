import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/server/auth/staff-session";
import { assertCanAssignRole } from "@/server/auth/role-policy";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";
import type { UserRole } from "@prisma/client";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const role = url.searchParams.get("role");
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.trim();

    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role: role as UserRole } : {}),
        ...(status ? { status: status as "ACTIVE" | "DISABLED" | "INVITED" } : {}),
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        locations: { include: { location: { select: { id: true, name: true, city: true } } } },
      },
      take: 200,
    });

    return apiSuccess({ users });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["CASHIER", "DIRECTOR", "ADMIN"]),
  password: z.string().min(8),
  locationIds: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  try {
    const actor = await requireAdmin();
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = createSchema.parse(json);
    assertCanAssignRole(actor.role, input.role as UserRole);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        role: input.role,
        status: "ACTIVE",
        passwordHash,
        locations: {
          create: input.locationIds.map((locationId) => ({ locationId })),
        },
      },
      select: { id: true, email: true, name: true, role: true, status: true },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "ADMIN_USER_CREATE",
      entityType: "User",
      entityId: user.id,
      after: { email: user.email, role: user.role },
      ...requestMeta(req),
    });

    return apiSuccess({ user }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
