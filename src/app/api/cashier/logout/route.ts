import { apiSuccess, handleApiError } from "@/lib/api/response";
import { clearCashierSessionCookie } from "@/server/auth/cashier-session";

export async function POST() {
  try {
    await clearCashierSessionCookie();
    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
