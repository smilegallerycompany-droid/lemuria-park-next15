import { apiSuccess, handleApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireCashier } from "@/server/auth/cashier-session";
import { startOfLocalDateInTimezone, todayInTimezone } from "@/lib/datetime";
import { endOfLocalDateInTimezone } from "@/server/services/analytics-period";
import { averageOrderValueKopecks } from "@/server/services/analytics-formulas";

export async function GET() {
  try {
    const sessionUser = await requireCashier();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: sessionUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        locations: {
          select: { location: { select: { id: true, name: true, timezone: true } } },
        },
      },
    });

    const tz = user.locations[0]?.location.timezone ?? "Europe/Moscow";
    const todayKey = todayInTimezone(tz);
    const todayFrom = startOfLocalDateInTimezone(todayKey, tz);
    const todayTo = endOfLocalDateInTimezone(todayKey, tz);
    const weekFrom = new Date(todayFrom.getTime() - 6 * 24 * 60 * 60 * 1000);

    const baseWhere = {
      cashierId: user.id,
      status: "PAID" as const,
      source: "CASHIER" as const,
    };

    const [todayAgg, weekAgg, todayPayments, weekPayments, checkIns, recentOrders] =
      await Promise.all([
        prisma.order.aggregate({
          where: { ...baseWhere, createdAt: { gte: todayFrom, lte: todayTo } },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
        prisma.order.aggregate({
          where: { ...baseWhere, createdAt: { gte: weekFrom, lte: todayTo } },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
        prisma.payment.groupBy({
          by: ["method"],
          where: {
            status: "SUCCEEDED",
            cashierId: user.id,
            createdAt: { gte: todayFrom, lte: todayTo },
          },
          _sum: { amount: true },
        }),
        prisma.payment.groupBy({
          by: ["method"],
          where: {
            status: "SUCCEEDED",
            cashierId: user.id,
            createdAt: { gte: weekFrom, lte: todayTo },
          },
          _sum: { amount: true },
        }),
        prisma.ticketCheckIn.count({
          where: {
            scannedById: user.id,
            result: "SUCCESS",
            scannedAt: { gte: weekFrom, lte: todayTo },
          },
        }),
        prisma.order.findMany({
          where: { cashierId: user.id, source: "CASHIER" },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            number: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            items: { select: { quantity: true } },
            payments: {
              where: { status: "SUCCEEDED" },
              select: { method: true },
              take: 1,
            },
            session: { select: { startsAt: true } },
          },
        }),
      ]);

    const weekTickets = await prisma.ticket.count({
      where: {
        order: { ...baseWhere, createdAt: { gte: weekFrom, lte: todayTo } },
        status: { in: ["VALID", "USED"] },
      },
    });

    function splitPayments(
      rows: Array<{ method: string; _sum: { amount: number | null } }>,
    ) {
      let cash = 0;
      let card = 0;
      let site = 0;
      for (const row of rows) {
        const amount = row._sum.amount ?? 0;
        if (row.method === "CASH") cash += amount;
        else if (row.method === "CARD_TERMINAL") card += amount;
        else if (row.method === "CARD_ONLINE") site += amount;
      }
      return { cash, card, site };
    }

    const weekPay = splitPayments(weekPayments);
    const todayPay = splitPayments(todayPayments);
    const weekRevenue = weekAgg._sum.totalAmount ?? 0;
    const weekOrders = weekAgg._count.id;

    return apiSuccess({
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        locations: user.locations.map((row) => row.location),
        timezone: tz,
      },
      stats: {
        todayRevenueKopecks: todayAgg._sum.totalAmount ?? 0,
        todayOrders: todayAgg._count.id,
        weekRevenueKopecks: weekRevenue,
        weekOrders,
        weekTickets,
        cashKopecks: weekPay.cash,
        cardKopecks: weekPay.card,
        siteKopecks: weekPay.site,
        todayCashKopecks: todayPay.cash,
        todayCardKopecks: todayPay.card,
        todaySiteKopecks: todayPay.site,
        averageOrderValueKopecks: averageOrderValueKopecks(weekRevenue, weekOrders),
        checkInsWeek: checkIns,
      },
      sales: recentOrders.map((order) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt.toISOString(),
        ticketCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        paymentMethod: order.payments[0]?.method ?? null,
        sessionStartsAt: order.session.startsAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
