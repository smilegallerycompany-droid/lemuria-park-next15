import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireCashier } from "@/server/auth/staff-session";
import { canAccessLocation } from "@/server/auth/location-access";
import { logTicketPrint } from "@/server/services/ticket-print";

const schema = z.object({
  ticketId: z.string().optional().nullable(),
  note: z.string().optional(),
  source: z.enum(["cashier", "director", "admin"]).optional(),
});

type RouteContext = { params: Promise<{ number: string }> };

export async function POST(req: Request, context: RouteContext) {
  try {
    const actor = await requireCashier();
    const { number } = await context.params;
    const json = await req.json().catch(() => ({}));
    const input = schema.parse(json);

    const source: "cashier" | "director" | "admin" =
      actor.role === "ADMIN" || actor.role === "OWNER"
        ? "admin"
        : actor.role === "DIRECTOR"
          ? "director"
          : "cashier";

    const order = await prisma.order.findUnique({
      where: { number },
      select: { id: true, cashierId: true, session: { select: { locationId: true } } },
    });
    if (!order || !canAccessLocation(actor, order.session.locationId)) {
      throw new ApiError("NOT_FOUND", "Заказ не найден", 404);
    }
    if (actor.role === "CASHIER" && order.cashierId && order.cashierId !== actor.id) {
      throw new ApiError("NOT_FOUND", "Заказ не найден", 404);
    }

    const printLog = await logTicketPrint({
      orderId: order.id,
      actorId: actor.id,
      ticketId: input.ticketId,
      source: input.source ?? source,
      note: input.note,
    });

    return apiSuccess({ printLog });
  } catch (error) {
    return handleApiError(error);
  }
}
