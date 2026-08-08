import { apiSuccess, handleApiError } from "@/lib/api/response";
import { requireAdmin } from "@/server/auth/staff-session";
import { getAdminDashboard } from "@/server/services/admin-dashboard";

export async function GET() {
  try {
    await requireAdmin();
    const data = await getAdminDashboard();
    return apiSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}
