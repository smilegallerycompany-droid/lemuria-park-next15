import { z } from "zod";
import type { DayOfWeek } from "@prisma/client";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";

const daySchema = z.object({
  dayOfWeek: z.enum([
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ]),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/),
  sessionIntervalMinutes: z.number().int().min(5).nullable().optional(),
  isClosed: z.boolean().default(false),
});

const putSchema = z.object({
  locationId: z.string().min(1),
  days: z.array(daySchema).length(7),
});

export async function GET(req: Request) {
  try {
    await requireDirector();
    const locationId = new URL(req.url).searchParams.get("locationId");
    if (!locationId) {
      throw new ApiError("VALIDATION_ERROR", "Укажите locationId", 400);
    }
    const schedules = await prisma.locationSchedule.findMany({
      where: { locationId },
      orderBy: { dayOfWeek: "asc" },
    });
    return apiSuccess({ locationId, schedules });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await requireDirector();
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = putSchema.parse(json);
    const meta = requestMeta(req);

    const location = await prisma.location.findUnique({ where: { id: input.locationId } });
    if (!location) {
      throw new ApiError("NOT_FOUND", "Локация не найдена", 404);
    }

    const schedules = await prisma.$transaction(async (tx) => {
      await tx.locationSchedule.deleteMany({ where: { locationId: input.locationId } });
      await tx.locationSchedule.createMany({
        data: input.days.map((day) => ({
          locationId: input.locationId,
          dayOfWeek: day.dayOfWeek as DayOfWeek,
          opensAt: day.opensAt,
          closesAt: day.closesAt,
          sessionIntervalMinutes: day.sessionIntervalMinutes ?? null,
          isClosed: day.isClosed,
        })),
      });
      return tx.locationSchedule.findMany({
        where: { locationId: input.locationId },
        orderBy: { dayOfWeek: "asc" },
      });
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "SCHEDULE_REPLACE",
      entityType: "Location",
      entityId: input.locationId,
      after: schedules,
      ...meta,
    });

    return apiSuccess({ locationId: input.locationId, schedules });
  } catch (error) {
    return handleApiError(error);
  }
}
