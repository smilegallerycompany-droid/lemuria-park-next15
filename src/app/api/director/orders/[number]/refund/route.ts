import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { requireDirector } from "@/server/auth/staff-session";
import { initiateRefund } from "@/server/services/refunds";
import { requestMeta } from "@/server/director/http";
import { prisma } from "@/lib/db/prisma";
import { canAccessLocation } from "@/server/auth/location-access";

const schema = z.object({
  confirm: z.literal(true),
  reason: z.string().min(3).max(500),
  ticketPublicIds: z.array(z.string().min(4)).max(50).optional(),
  allowUsedTickets: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ number: string }> };

/** Director/admin/owner refund. Cashier cannot call this route. Staging never calls ЮKassa. */
export async function POST(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { number } = await context.params;
    const existing = await prisma.order.findUnique({
      where: { number },
      select: { locationId: true, session: { select: { locationId: true } } },
    });
    if (!existing || !canAccessLocation(actor, existing.locationId ?? existing.session.locationId)) {
      throw new ApiError("NOT_FOUND", "Заказ не найден", 404);
    }
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = schema.parse(json);
    const meta = requestMeta(req);

    const result = await initiateRefund({
      orderNumber: number,
      actorId: actor.id,
      actorRole: actor.role,
      reason: input.reason,
      ticketPublicIds: input.ticketPublicIds,
      allowUsedTickets: input.allowUsedTickets,
      idempotencyKey: req.headers.get("Idempotency-Key"),
      ip: meta.ipAddress,
      ua: meta.userAgent,
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
