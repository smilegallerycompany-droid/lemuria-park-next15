import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";

type RouteContext = { params: Promise<{ number: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    await requireDirector();
    const { number } = await context.params;
    const order = await prisma.order.findUnique({
      where: { number },
      include: {
        items: { include: { ticketType: { select: { code: true, name: true } } } },
        location: true,
        session: true,
        payments: { orderBy: { createdAt: "desc" } },
        refunds: { orderBy: { createdAt: "desc" } },
        tickets: {
          include: { ticketType: { select: { name: true, code: true } } },
          orderBy: { createdAt: "asc" },
        },
        cashier: { select: { id: true, name: true, email: true } },
      },
    });
    if (!order) {
      throw new ApiError("NOT_FOUND", "Заказ не найден", 404);
    }
    return apiSuccess({ order });
  } catch (error) {
    return handleApiError(error);
  }
}
