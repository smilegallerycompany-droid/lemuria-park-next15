import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";
import { generateSessionsForLocation } from "@/server/services/schedule-generation";
import { DomainError } from "@/server/domain/errors";

const schema = z.object({
  locationId: z.string().min(1),
  windowDays: z.number().int().min(1).max(120).optional(),
});

export async function POST(req: Request) {
  try {
    const actor = await requireDirector();
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = schema.parse(json);
    const meta = requestMeta(req);

    const location = await prisma.location.findUnique({ where: { id: input.locationId } });
    if (!location) {
      throw new DomainError("LOCATION_NOT_FOUND", "Локация не найдена");
    }

    const result = await generateSessionsForLocation(prisma, {
      locationId: input.locationId,
      windowDays: input.windowDays,
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "SESSIONS_GENERATE",
      entityType: "Location",
      entityId: input.locationId,
      metadata: result,
      ...meta,
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
