import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getCashierSessionUser } from "@/server/auth/cashier-session";

export async function GET() {
  try {
    const user = await getCashierSessionUser();
    if (!user) return apiError("UNAUTHORIZED", "Требуется вход кассира", 401);

    const locations = await prisma.location.findMany({
      where: {
        status: { in: ["ACTIVE", "UPCOMING"] },
        ...(user.locationIds.length > 0 ? { id: { in: user.locationIds } } : {}),
      },
      orderBy: { city: "asc" },
      select: { id: true, name: true, city: true },
    });

    return apiSuccess({ locations });
  } catch (error) {
    return handleApiError(error);
  }
}
