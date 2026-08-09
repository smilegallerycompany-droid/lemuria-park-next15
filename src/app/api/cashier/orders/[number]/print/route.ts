import { z } from "zod";
import { apiSuccess, apiError, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getCashierSessionUser } from "@/server/auth/cashier-session";
import { requireDirector } from "@/server/auth/staff-session";
import { logTicketPrint } from "@/server/services/ticket-print";

const schema = z.object({
  ticketId: z.string().optional().nullable(),
  note: z.string().optional(),
  source: z.enum(["cashier", "director", "admin"]).optional(),
});

type RouteContext = { params: Promise<{ number: string }> };

export async function POST(req: Request, context: RouteContext) {
  try {
    const { number } = await context.params;
    const json = await req.json().catch(() => ({}));
    const input = schema.parse(json);

    let actorId: string;
    let source: "cashier" | "director" | "admin" = input.source ?? "cashier";

    const cashier = await getCashierSessionUser();
    if (cashier) {
      actorId = cashier.id;
      source = "cashier";
    } else {
      const director = await requireDirector();
      actorId = director.id;
      source = director.role === "ADMIN" || director.role === "OWNER" ? "admin" : "director";
    }

    const order = await prisma.order.findUnique({ where: { number }, select: { id: true } });
    if (!order) throw new ApiError("NOT_FOUND", "Заказ не найден", 404);

    const printLog = await logTicketPrint({
      orderId: order.id,
      actorId,
      ticketId: input.ticketId,
      source,
      note: input.note,
    });

    return apiSuccess({ printLog });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Требуется")) {
      return apiError("UNAUTHORIZED", "Требуется авторизация", 401);
    }
    return handleApiError(error);
  }
}
