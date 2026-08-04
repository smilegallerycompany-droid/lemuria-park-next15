import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";

const createSchema = z.object({
  slug: z.string().min(2).max(64),
  name: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  timezone: z.string().default("Europe/Moscow"),
  defaultCapacity: z.number().int().min(1).default(15),
  sessionIntervalMinutes: z.number().int().min(5).default(30),
  visitDurationMinutes: z.number().int().min(5).default(45),
  status: z.enum(["UPCOMING", "ACTIVE", "PAUSED", "CLOSED"]).default("UPCOMING"),
  phone: z.string().optional(),
  mapUrl: z.string().url().optional().or(z.literal("")),
});

export async function GET() {
  try {
    await requireDirector();
    const locations = await prisma.location.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: { _count: { select: { sessions: true, orders: true } } },
    });
    return apiSuccess({ locations });
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

    const location = await prisma.location.create({
      data: {
        slug: input.slug,
        name: input.name,
        city: input.city,
        address: input.address,
        timezone: input.timezone,
        defaultCapacity: input.defaultCapacity,
        sessionIntervalMinutes: input.sessionIntervalMinutes,
        visitDurationMinutes: input.visitDurationMinutes,
        status: input.status,
        phone: input.phone || null,
        mapUrl: input.mapUrl || null,
      },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "LOCATION_CREATE",
      entityType: "Location",
      entityId: location.id,
      after: location,
      ...meta,
    });

    return apiSuccess({ location }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
