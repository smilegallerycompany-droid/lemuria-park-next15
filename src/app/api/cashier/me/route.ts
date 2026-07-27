import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { getCashierSessionUser } from "@/server/auth/cashier-session";

export async function GET() {
  try {
    const user = await getCashierSessionUser();
    if (!user) return apiError("NOT_FOUND", "Сессия кассира не найдена", 401);
    return apiSuccess(user);
  } catch (error) {
    return handleApiError(error);
  }
}
