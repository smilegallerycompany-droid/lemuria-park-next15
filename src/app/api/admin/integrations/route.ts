import { apiSuccess, handleApiError } from "@/lib/api/response";
import { requireAdmin } from "@/server/auth/staff-session";
import { getIntegrationsStatus } from "@/server/services/admin-dashboard";

export async function GET() {
  try {
    await requireAdmin();
    return apiSuccess(await getIntegrationsStatus());
  } catch (error) {
    return handleApiError(error);
  }
}
