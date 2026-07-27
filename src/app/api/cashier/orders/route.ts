import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { cashierOrdersQuerySchema } from "@/lib/validation/cashier";
import { getCashierSessionUser } from "@/server/auth/cashier-session";
import { listCashierOrders } from "@/server/services/cashier-workspace";

export async function GET(req: Request) {
  try {
    const user = await getCashierSessionUser();
    if (!user) return apiError("NOT_FOUND", "Требуется вход кассира", 401);

    const url = new URL(req.url);
    const query = cashierOrdersQuerySchema.parse({
      filter: url.searchParams.get("filter") ?? "today",
      search: url.searchParams.get("search") ?? undefined,
    });

    const orders = await listCashierOrders(query);
    return apiSuccess({ orders });
  } catch (error) {
    return handleApiError(error);
  }
}
