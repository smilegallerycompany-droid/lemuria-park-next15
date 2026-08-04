import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { recordAuditLog } from "@/lib/audit";
import { requestMeta } from "@/server/director/http";

const schema = z.object({
  confirm: z.literal(true),
  reason: z.string().min(3).max(500),
  amount: z.number().int().min(1).optional(),
});

type RouteContext = { params: Promise<{ number: string }> };

export async function POST(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { number } = await context.params;
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = schema.parse(json);
    const meta = requestMeta(req);

    const order = await prisma.order.findUnique({
      where: { number },
      include: { tickets: true, refunds: true },
    });
    if (!order) {
      throw new ApiError("NOT_FOUND", "Заказ не найден", 404);
    }
    if (order.status !== "PAID") {
      throw new ApiError("CONFLICT", "Возврат доступен только для оплаченных заказов", 409);
    }

    const refundAmount = input.amount ?? order.totalAmount;

    const result = await prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          orderId: order.id,
          amount: refundAmount,
          status: "COMPLETED",
          reason: input.reason,
          actorId: actor.id,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: "REFUNDED" },
      });

      await tx.ticket.updateMany({
        where: { orderId: order.id, status: { in: ["VALID", "USED"] } },
        data: { status: "REFUNDED" },
      });

      await tx.payment.updateMany({
        where: { orderId: order.id, status: "SUCCEEDED" },
        data: { status: "REFUNDED" },
      });

      return refund;
    });

    await recordAuditLog(prisma, {
      actorId: actor.id,
      action: "ORDER_MANUAL_REFUND",
      entityType: "Order",
      entityId: order.id,
      metadata: { number: order.number, refundId: result.id, amount: refundAmount, reason: input.reason },
      ...meta,
    });

    return apiSuccess({ refund: result });
  } catch (error) {
    return handleApiError(error);
  }
}
