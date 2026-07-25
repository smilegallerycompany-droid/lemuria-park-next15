import { apiSuccess, handleApiError } from "@/lib/api/response";
import { sessionsQuerySchema } from "@/lib/validation/reservation";
import { listPublicSessions } from "@/server/services/session-listing";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = sessionsQuerySchema.parse({
      locationSlug: url.searchParams.get("locationSlug") ?? undefined,
      date: url.searchParams.get("date") ?? undefined,
    });

    const response = await listPublicSessions(query);
    return apiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
}
