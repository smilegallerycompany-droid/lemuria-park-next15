import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  minAge: z.number().int().nullable().optional(),
  maxAge: z.number().int().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { id } = await context.params;
    const before = await prisma.ticketType.findUnique({ where: { id } });
    if (!before) {
      throw new ApiError("NOT_FOUND", "Тип билета не найден", 404);
    }

    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = patchSchema.parse(json);
    const meta = requestMeta(req);

    const ticketType = await prisma.ticketType.update({ where: { id }, data: input });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "TICKET_TYPE_UPDATE",
      entityType: "TicketType",
      entityId: id,
      before,
      after: ticketType,
      ...meta,
    });

    return apiSuccess({ ticketType: { ...ticketType, ageRule: null, isFree: false } });
  } catch (error) {
    return handleApiError(error);
  }
}
