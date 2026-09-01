import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { closeCashierShift } from "@/server/services/cashier-shifts";
import { clientIpFromRequest } from "@/server/security/rate-limit";
import { constrainLocationIds, assertLocationAccess } from "@/server/auth/location-access";

export async function GET(req: Request) {
  try {
    const actor = await requireDirector();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const locationId = url.searchParams.get("locationId");
    const cashierId = url.searchParams.get("cashierId");
    const differenceOnly = url.searchParams.get("difference") === "1";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const scoped = constrainLocationIds(actor, locationId);

    const shifts = await prisma.cashierShift.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(scoped ? { locationId: { in: scoped } } : {}),
        ...(cashierId ? { userId: cashierId } : {}),
        ...(differenceOnly ? { cashDifferenceAmount: { not: 0 } } : {}),
        ...(from || to
          ? {
              openedAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { openedAt: "desc" },
      take: 200,
      include: {
        user: { select: { id: true, name: true, email: true } },
        location: { select: { id: true, name: true, city: true } },
      },
    });

    return apiSuccess({
      shifts: shifts.map((s) => ({
        id: s.id,
        publicId: s.publicId,
        status: s.status,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        cashier: s.user,
        location: s.location,
        revenue:
          s.cashSalesAmount + s.cardSalesAmount + s.onlineSalesAmount,
        cashSalesAmount: s.cashSalesAmount,
        cardSalesAmount: s.cardSalesAmount,
        onlineSalesAmount: s.onlineSalesAmount,
        cashDifferenceAmount: s.cashDifferenceAmount,
        ordersCount: s.ordersCount,
        ticketsCount: s.ticketsCount,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const forceCloseSchema = z.object({
  shiftId: z.string().min(1),
  closingCashAmount: z.number().int().min(0),
  reason: z.string().min(3).max(500),
});

export async function POST(req: Request) {
  try {
    const actor = await requireDirector();
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = forceCloseSchema.parse(json);
    const shift = await prisma.cashierShift.findUnique({
      where: { id: input.shiftId },
      select: { locationId: true },
    });
    if (!shift) throw new ApiError("NOT_FOUND", "Смена не найдена", 404);
    assertLocationAccess(actor, shift.locationId);

    const result = await closeCashierShift({
      userId: actor.id,
      actorId: actor.id,
      shiftId: input.shiftId,
      closingCashAmount: input.closingCashAmount,
      reason: input.reason,
      force: true,
      ip: clientIpFromRequest(req),
      ua: req.headers.get("user-agent"),
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
