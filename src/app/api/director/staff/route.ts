import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { hashPassword } from "@/server/auth/password";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["CASHIER", "ADMIN"]).default("CASHIER"),
  password: z.string().min(8),
  locationIds: z.array(z.string()).default([]),
});

export async function GET() {
  try {
    await requireDirector();
    const staff = await prisma.user.findMany({
      where: { role: { in: ["CASHIER", "ADMIN", "OWNER"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        locations: { include: { location: { select: { id: true, name: true } } } },
      },
    });
    return apiSuccess({ staff });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireDirector();
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = createSchema.parse(json);
    const meta = requestMeta(req);

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        name: input.name,
        role: input.role as UserRole,
        passwordHash,
        status: "ACTIVE",
        locations: {
          create: input.locationIds.map((locationId) => ({ locationId })),
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        locations: { include: { location: { select: { id: true, name: true } } } },
      },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "STAFF_CREATE",
      entityType: "User",
      entityId: user.id,
      after: { email: user.email, name: user.name, role: user.role },
      ...meta,
    });

    return apiSuccess({ user }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
