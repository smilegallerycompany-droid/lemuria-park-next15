import { apiSuccess, handleApiError } from "@/lib/api/response";
import { requireDirector } from "@/server/auth/staff-session";
import { getDirectorAnalytics } from "@/server/services/analytics";
import { parseIsoDateParam, endOfDayUtc } from "@/server/director/http";
import { startOfLocalDateInTimezone, todayInTimezone } from "@/lib/datetime";

export async function GET(req: Request) {
  try {
    await requireDirector();
    const url = new URL(req.url);
    const locationId = url.searchParams.get("locationId") ?? undefined;
    const timeZone = "Europe/Moscow";

    const todayKey = todayInTimezone(timeZone);
    const defaultFrom = startOfLocalDateInTimezone(todayKey, timeZone);
    const defaultTo = endOfDayUtc(defaultFrom);

    const from = parseIsoDateParam(url.searchParams.get("from"), defaultFrom);
    const to = parseIsoDateParam(url.searchParams.get("to"), defaultTo);

    const analytics = await getDirectorAnalytics({
      from,
      to,
      locationId,
    });

    return apiSuccess(analytics);
  } catch (error) {
    return handleApiError(error);
  }
}
