import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { requireCashier } from "@/server/auth/cashier-session";
import { prisma } from "@/lib/db/prisma";
import { locationIdsForActor } from "@/server/auth/location-access";
export async function GET(request: Request) {
  try {
    const user = await requireCashier();
    const number = new URL(request.url).searchParams.get("number");
    if (!number || number.length > 128) throw new ApiError("VALIDATION_ERROR", "Укажите заказ", 400);
    const locationIds = locationIdsForActor(user);
    const order = await prisma.order.findFirst({ where: { number, cashierId: user.id, source: "CASHIER",
      ...(locationIds === null ? {} : { locationId: { in: locationIds } }) },
      select: { number: true, status: true, totalAmount: true, evotorCheckout: { select: { state: true, cashReceived: true, changeAmount: true } } } });
    if (!order) throw new ApiError("NOT_FOUND", "Заказ не найден", 404);
    const response = apiSuccess(order);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return handleApiError(error); }
}
