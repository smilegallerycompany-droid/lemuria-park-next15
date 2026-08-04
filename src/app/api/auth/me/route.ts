import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { getStaffSessionUser } from "@/server/auth/staff-session";

export async function GET() {
  try {
    const user = await getStaffSessionUser();
    if (!user) return apiError("UNAUTHORIZED", "Требуется авторизация", 401);
    return apiSuccess(user);
  } catch (error) {
    return handleApiError(error);
  }
}
