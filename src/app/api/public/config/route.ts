import { apiSuccess, handleApiError } from "@/lib/api/response";
import { getPublicSiteConfig } from "@/server/services/site-config";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const locationSlug = url.searchParams.get("locationSlug")?.trim() || undefined;
    const config = await getPublicSiteConfig(locationSlug);
    return apiSuccess(config);
  } catch (error) {
    return handleApiError(error);
  }
}
