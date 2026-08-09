import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";

const patchSchema = z.object({
  slug: z.string().min(2).max(64).optional(),
  name: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  addressLine2: z.string().nullable().optional(),
  timezone: z.string().optional(),
  status: z.enum(["UPCOMING", "ACTIVE", "PAUSED", "CLOSED"]).optional(),
  defaultCapacity: z.number().int().min(1).optional(),
  sessionIntervalMinutes: z.number().int().min(5).optional(),
  visitDurationMinutes: z.number().int().min(5).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  mapUrl: z.string().nullable().optional(),
  routeUrl: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  mapZoom: z.number().int().min(1).max(21).optional(),
  mapLabel: z.string().nullable().optional(),
  activeFrom: z.string().datetime().nullable().optional(),
  activeTo: z.string().datetime().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    await requireDirector();
    const { id } = await context.params;
    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        schedules: { orderBy: { dayOfWeek: "asc" } },
        _count: { select: { sessions: true, orders: true } },
      },
    });
    if (!location) {
      throw new ApiError("NOT_FOUND", "Локация не найдена", 404);
    }
    return apiSuccess({ location });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { id } = await context.params;
    const before = await prisma.location.findUnique({ where: { id } });
    if (!before) {
      throw new ApiError("NOT_FOUND", "Локация не найдена", 404);
    }

    const { assertLocationAccess } = await import("@/server/auth/location-access");
    assertLocationAccess(actor, id);

    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = patchSchema.parse(json);
    const meta = requestMeta(req);

    const location = await prisma.location.update({
      where: { id },
      data: {
        ...input,
        activeFrom:
          input.activeFrom === undefined
            ? undefined
            : input.activeFrom
              ? new Date(input.activeFrom)
              : null,
        activeTo:
          input.activeTo === undefined
            ? undefined
            : input.activeTo
              ? new Date(input.activeTo)
              : null,
      },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "LOCATION_MAP_UPDATE",
      entityType: "Location",
      entityId: id,
      before,
      after: location,
      ...meta,
    });

    const { revalidatePublicCms } = await import("@/server/cms/revalidate");
    revalidatePublicCms();

    return apiSuccess({ location });
  } catch (error) {
    return handleApiError(error);
  }
}
