import { apiSuccess, handleApiError } from "@/lib/api/response";
import { requireCashier } from "@/server/auth/cashier-session";

export async function GET() {
  try {
    const user = await requireCashier();
    return apiSuccess(user);
  } catch (error) {
    return handleApiError(error);
  }
}
