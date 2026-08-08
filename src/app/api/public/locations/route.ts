import { apiSuccess, handleApiError } from "@/lib/api/response";
import { getPublicLocationsPayload } from "@/server/services/public-locations";

export async function GET() {
  try {
    const data = await getPublicLocationsPayload();
    return apiSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}
