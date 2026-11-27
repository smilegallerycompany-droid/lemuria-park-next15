import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { requireCashier } from "@/server/auth/cashier-session";
import { prisma } from "@/lib/db/prisma";
export async function GET(request: Request) {
  try {
    const user = await requireCashier();
    const number = new URL(request.url).searchParams.get("number");
    if (!number) throw new ApiError("VALIDATION_ERROR", "Укажите заказ", 400);
    const order = await prisma.order.findFirst({ where: { number, cashierId: user.id },
      select: { number: true, status: true, totalAmount: true, evotorCheckout: { select: { state: true, cashReceived: true, changeAmount: true } } } });
    if (!order) throw new ApiError("NOT_FOUND", "Заказ не найден", 404);
    return apiSuccess(order);
  } catch (error) { return handleApiError(error); }
}
