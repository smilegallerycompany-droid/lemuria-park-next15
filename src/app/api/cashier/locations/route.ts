import { apiSuccess, handleApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireCashier } from "@/server/auth/cashier-session";
import { locationIdsForActor } from "@/server/auth/location-access";

export async function GET() {
  try {
    const user = await requireCashier();
    const scope = locationIdsForActor(user);

    const locations = await prisma.location.findMany({
      where: {
        status: { in: ["ACTIVE", "UPCOMING"] },
        ...(scope === null ? {} : { id: { in: scope } }),
      },
      orderBy: { city: "asc" },
      select: { id: true, name: true, city: true },
    });

    return apiSuccess({ locations });
  } catch (error) {
    return handleApiError(error);
  }
}
