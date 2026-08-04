import { apiSuccess, apiError, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getCashierSessionUser } from "@/server/auth/cashier-session";
import { recordAuditLog } from "@/lib/audit";

type RouteContext = { params: Promise<{ number: string }> };

export async function POST(req: Request, context: RouteContext) {
  try {
    const user = await getCashierSessionUser();
    if (!user) return apiError("UNAUTHORIZED", "Требуется вход кассира", 401);

    const { number } = await context.params;
    const order = await prisma.order.findUnique({ where: { number }, select: { id: true, number: true } });
    if (!order) throw new ApiError("NOT_FOUND", "Заказ не найден", 404);

    const body = (await req.json().catch(() => ({}))) as { note?: string };
    const printLog = await prisma.printLog.create({
      data: {
        orderId: order.id,
        actorId: user.id,
        note: body.note ?? "browser-print",
      },
    });

    await recordAuditLog(prisma, {
      actorId: user.id,
      action: "ORDER_PRINT",
      entityType: "Order",
      entityId: order.id,
      metadata: { number: order.number, printLogId: printLog.id },
    });

    return apiSuccess({ printLog });
  } catch (error) {
    return handleApiError(error);
  }
}
