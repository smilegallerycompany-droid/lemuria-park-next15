import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { parseIsoDateParam } from "@/server/director/http";
import { assertLocationAccess } from "@/server/auth/location-access";

export async function GET(req: Request) {
  try {
    const actor = await requireDirector();
    const url = new URL(req.url);
    const locationId = url.searchParams.get("locationId");
    if (!locationId) {
      throw new ApiError("VALIDATION_ERROR", "Укажите locationId", 400);
    }
    assertLocationAccess(actor, locationId);
    const from = parseIsoDateParam(url.searchParams.get("from"), new Date());
    const to = parseIsoDateParam(
      url.searchParams.get("to"),
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    );

    const sessions = await prisma.session.findMany({
      where: {
        locationId,
        startsAt: { gte: from, lte: to },
      },
      orderBy: { startsAt: "asc" },
      include: {
        location: { select: { name: true, timezone: true } },
        _count: { select: { tickets: true, orders: true } },
      },
    });

    return apiSuccess({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}
