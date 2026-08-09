import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/server/auth/staff-session";
import { buildOrderTimeline } from "@/server/services/order-timeline";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        status: true,
        provider: true,
        providerPaymentId: true,
        createdAt: true,
        updatedAt: true,
        order: {
          select: {
            id: true,
            number: true,
            status: true,
            source: true,
            totalAmount: true,
            customerName: true,
            location: { select: { id: true, name: true, city: true } },
            tickets: {
              select: { publicId: true, status: true, ticketType: { select: { name: true } } },
              take: 50,
            },
            refunds: {
              select: { id: true, amount: true, status: true, createdAt: true, updatedAt: true },
            },
          },
        },
      },
    });

    if (!payment) throw new ApiError("NOT_FOUND", "Платёж не найден", 404);

    const refundedAmount = payment.order.refunds
      .filter((r) => r.status === "COMPLETED" || r.status === "SUCCEEDED")
      .reduce((sum, r) => sum + r.amount, 0);

    const succeededAt =
      payment.status === "SUCCEEDED" ? payment.updatedAt.toISOString() : null;

    const webhookEvents = await prisma.auditLog.findMany({
      where: {
        OR: [{ entityId: payment.id }, { entityId: payment.order.number }, { entityId: payment.order.id }],
        action: { contains: "WEBHOOK" },
      },
      orderBy: { createdAt: "asc" },
      take: 30,
      select: {
        id: true,
        action: true,
        createdAt: true,
        entityType: true,
      },
    });

    const timeline = await buildOrderTimeline(payment.order.number);

    return apiSuccess({
      payment: {
        id: payment.id,
        orderNumber: payment.order.number,
        provider: payment.provider,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        providerPaymentId: payment.providerPaymentId,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        succeededAt,
        refundedAmount,
        order: payment.order,
        tickets: payment.order.tickets,
        webhookEvents,
        // Never expose payload/secrets/PAN
      },
      timeline,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
