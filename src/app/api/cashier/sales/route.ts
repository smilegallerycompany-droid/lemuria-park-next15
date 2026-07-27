import { apiSuccess, apiError, handleApiError, ApiError } from "@/lib/api/response";
import { cashierSaleSchema } from "@/lib/validation/cashier";
import { getCashierSessionUser } from "@/server/auth/cashier-session";
import { createCashierSale } from "@/server/services/cashier-sales";

export async function POST(req: Request) {
  try {
    const user = await getCashierSessionUser();
    if (!user) return apiError("NOT_FOUND", "Требуется вход кассира", 401);

    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON в теле запроса", 400);
    });
    const input = cashierSaleSchema.parse(json);
    const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;
    const order = await createCashierSale(input, user.id, idempotencyKey);

    return apiSuccess(
      {
        number: order.number,
        status: order.status,
        source: order.source,
        totalAmount: order.totalAmount,
        items: order.items.map((item) => ({
          ticketTypeName: item.ticketTypeName,
          quantity: item.quantity,
          subtotal: item.subtotalAmount,
        })),
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
