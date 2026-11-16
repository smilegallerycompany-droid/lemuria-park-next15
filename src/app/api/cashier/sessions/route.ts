import { prisma } from "@/lib/db/prisma";
import { getOpenShiftForCashier } from "@/server/services/cashier-shifts";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { requireCashier } from "@/server/auth/cashier-session";
import { assertLocationAccess, locationIdsForActor } from "@/server/auth/location-access";
import { listCashierSessionsForToday } from "@/server/services/cashier-workspace";

export async function GET(req: Request) {
  try {
    const user = await requireCashier();
    const url = new URL(req.url);
    const requested = url.searchParams.get("locationId");
    if (requested) {
      assertLocationAccess(user, requested);
    }
    const scope = locationIdsForActor(user);

    const shift = requested ? null : await getOpenShiftForCashier(prisma, user.id);
    const locationId =
      requested ?? shift?.locationId ?? (scope && scope.length === 1 ? scope[0] : undefined);
    if (locationId) assertLocationAccess(user, locationId);
    if (!locationId && scope) {
      return apiSuccess({
        location: { city: "", venue: "", timezone: "Europe/Moscow" },
        date: "",
        ticketTypes: [],
        sessions: [],
      });
    }
    const data = await listCashierSessionsForToday(locationId);
    return apiSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}
