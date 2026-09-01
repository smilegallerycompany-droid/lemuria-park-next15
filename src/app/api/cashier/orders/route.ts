import { apiSuccess, handleApiError } from "@/lib/api/response";
import { cashierOrdersQuerySchema } from "@/lib/validation/cashier";
import { requireCashier } from "@/server/auth/cashier-session";
import { locationIdsForActor } from "@/server/auth/location-access";
import { listCashierOrders } from "@/server/services/cashier-workspace";

export async function GET(req: Request) {
  try {
    const user = await requireCashier();

    const url = new URL(req.url);
    const query = cashierOrdersQuerySchema.parse({
      filter: url.searchParams.get("filter") ?? "today",
      search: url.searchParams.get("search") ?? undefined,
    });

    const orders = await listCashierOrders(query, {
      locationIds: locationIdsForActor(user),
      cashierId: user.role === "CASHIER" ? user.id : undefined,
    });
    return apiSuccess({ orders });
  } catch (error) {
    return handleApiError(error);
  }
}
