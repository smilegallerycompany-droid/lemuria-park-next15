import { apiSuccess, handleApiError } from "@/lib/api/response";
import { clearStaffSessionCookie } from "@/server/auth/staff-session";

export async function POST() {
  try {
    await clearStaffSessionCookie();
    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
