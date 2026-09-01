import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireCashier } from "@/server/auth/cashier-session";
import { canAccessLocation } from "@/server/auth/location-access";
import { formatDateInTimezone, formatTimeInTimezone } from "@/lib/datetime";

type RouteContext = { params: Promise<{ number: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    const user = await requireCashier();

    const { number } = await context.params;
    const order = await prisma.order.findUnique({
      where: { number },
      include: {
        items: true,
        session: { include: { location: true } },
        tickets: { include: { ticketType: { select: { name: true, code: true } } } },
        payments: { orderBy: { createdAt: "desc" } },
        deliveries: { orderBy: { createdAt: "desc" }, take: 5 },
        printLogs: { orderBy: { createdAt: "desc" }, take: 5 },
        cashier: { select: { name: true, email: true } },
      },
    });
    if (!order || !canAccessLocation(user, order.session.locationId)) {
      throw new ApiError("NOT_FOUND", "Заказ не найден", 404);
    }
    if (user.role === "CASHIER" && order.cashierId && order.cashierId !== user.id) {
      throw new ApiError("NOT_FOUND", "Заказ не найден", 404);
    }

    const tz = order.session.location.timezone;
    return apiSuccess({
      order: {
        number: order.number,
        status: order.status,
        source: order.source,
        totalAmount: order.totalAmount,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        createdAt: order.createdAt.toISOString(),
        cashierName: order.cashier?.name ?? null,
        locationName: order.session.location.name,
        sessionDate: formatDateInTimezone(order.session.startsAt, tz),
        sessionTime: formatTimeInTimezone(order.session.startsAt, tz),
        items: order.items.map((item) => ({
          ticketTypeName: item.ticketTypeName,
          quantity: item.quantity,
          unitPriceAmount: item.unitPriceAmount,
          subtotalAmount: item.subtotalAmount,
        })),
        tickets: order.tickets.map((ticket) => ({
          publicId: ticket.publicId,
          qrToken: ticket.qrToken,
          status: ticket.status,
          ticketTypeName: ticket.ticketType.name,
        })),
        payments: order.payments.map((payment) => ({
          method: payment.method,
          status: payment.status,
          amount: payment.amount,
        })),
        emailDelivery: order.deliveries[0]
          ? {
              status: order.deliveries[0].status,
              toAddress: order.deliveries[0].toAddress,
              errorMessage: order.deliveries[0].errorMessage,
              createdAt: order.deliveries[0].createdAt.toISOString(),
            }
          : null,
        printCount: order.printLogs.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
