import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";

const patchSchema = z.object({
  priceAmount: z.number().int().min(0).optional(),
  validTo: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { id } = await context.params;
    const before = await prisma.priceRule.findUnique({ where: { id } });
    if (!before) {
      throw new ApiError("NOT_FOUND", "Правило цены не найдено", 404);
    }

    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = patchSchema.parse(json);
    const meta = requestMeta(req);

    const price = await prisma.priceRule.update({
      where: { id },
      data: {
        priceAmount: input.priceAmount,
        isActive: input.isActive,
        validTo: input.validTo === undefined ? undefined : input.validTo ? new Date(input.validTo) : null,
      },
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "PRICE_UPDATE",
      entityType: "PriceRule",
      entityId: id,
      before,
      after: price,
      ...meta,
    });

    return apiSuccess({ price });
  } catch (error) {
    return handleApiError(error);
  }
}
