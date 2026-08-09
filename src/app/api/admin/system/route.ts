import { apiSuccess, handleApiError } from "@/lib/api/response";
import { requireAdmin } from "@/server/auth/staff-session";
import { getAdminSystemHealth } from "@/server/services/admin-system";

export async function GET() {
  try {
    await requireAdmin();
    const health = await getAdminSystemHealth();
    return apiSuccess(health);
  } catch (error) {
    return handleApiError(error);
  }
}
