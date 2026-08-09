import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";
import { computeShiftCashSummary } from "@/server/services/cashier-shifts";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    await requireDirector();
    const { id } = await context.params;

    const shift = await prisma.cashierShift.findFirst({
      where: { OR: [{ id }, { publicId: id }] },
      include: {
        user: { select: { id: true, name: true, email: true } },
        location: { select: { id: true, name: true, city: true } },
        cashOperations: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { name: true } } },
        },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            refunds: true,
            payments: { select: { method: true, status: true, amount: true } },
          },
        },
      },
    });
    if (!shift) throw new ApiError("NOT_FOUND", "Смена не найдена", 404);

    const summary = await computeShiftCashSummary(shift.id);
    const audit = await prisma.auditLog.findMany({
      where: { entityType: "CashierShift", entityId: shift.id },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    const checkIns = await prisma.ticketCheckIn.count({
      where: {
        result: "SUCCESS",
        ticket: { order: { shiftId: shift.id } },
      },
    });

    return apiSuccess({
      shift,
      summary: {
        expectedCashAmount: summary.expectedCashAmount,
        cashIn: summary.cashIn,
        cashOut: summary.cashOut,
        cashRefunds: summary.cashRefunds,
        refundsCount: summary.refundsCount,
        checkIns,
        durationMinutes: shift.closedAt
          ? Math.round((shift.closedAt.getTime() - shift.openedAt.getTime()) / 60000)
          : Math.round((Date.now() - shift.openedAt.getTime()) / 60000),
      },
      audit,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
