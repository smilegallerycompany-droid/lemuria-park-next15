import { apiSuccess, handleApiError } from "@/lib/api/response";
import { getPublicSiteConfig } from "@/server/services/site-config";

export async function GET() {
  try {
    const config = await getPublicSiteConfig();
    return apiSuccess(config);
  } catch (error) {
    return handleApiError(error);
  }
}
