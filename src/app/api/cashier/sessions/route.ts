import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { getCashierSessionUser } from "@/server/auth/cashier-session";
import { listCashierSessionsForToday } from "@/server/services/cashier-workspace";

export async function GET() {
  try {
    const user = await getCashierSessionUser();
    if (!user) return apiError("NOT_FOUND", "Требуется вход кассира", 401);
    const data = await listCashierSessionsForToday();
    return apiSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}
