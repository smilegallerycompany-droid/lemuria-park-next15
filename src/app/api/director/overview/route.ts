import { apiSuccess, handleApiError } from "@/lib/api/response";
import { requireDirector } from "@/server/auth/staff-session";
import { getDirectorAlerts } from "@/server/services/director-alerts";
import { getUpcomingSessionsForDirector } from "@/server/services/director-sessions-today";
import { getDirectorAnalyticsReport } from "@/server/services/analytics-report";
import { todayInTimezone, addDaysUtc } from "@/lib/datetime";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const user = await requireDirector();
    const locationIds =
      user.role === "DIRECTOR" && user.locationIds.length > 0 ? user.locationIds : undefined;

    const tz = "Europe/Moscow";
    const now = new Date();
    const today = todayInTimezone(tz, now);
    const tomorrowLocal = todayInTimezone(tz, addDaysUtc(now, 1));
    // Use calendar day windows via analytics report presets
    const from = new Date(`${today}T00:00:00+03:00`);
    const to = new Date(`${today}T23:59:59.999+03:00`);
    const prevFrom = new Date(`${todayInTimezone(tz, addDaysUtc(now, -1))}T00:00:00+03:00`);
    const prevTo = new Date(`${todayInTimezone(tz, addDaysUtc(now, -1))}T23:59:59.999+03:00`);

    const locationId = locationIds?.[0];

    const [report, alerts, sessions, hourlyOrders, openShifts, closedShiftsToday, diffShifts] =
      await Promise.all([
      getDirectorAnalyticsReport({
        from,
        to,
        locationId,
        timeZone: tz,
        now,
      }),
      getDirectorAlerts(locationIds),
      getUpcomingSessionsForDirector({ locationIds, take: 8 }),
      prisma.order.findMany({
        where: {
          status: "PAID",
          createdAt: { gte: from, lte: to },
          ...(locationId ? { locationId } : {}),
        },
        select: { createdAt: true, totalAmount: true, source: true },
      }),
      prisma.cashierShift.findMany({
        where: {
          status: "OPEN",
          ...(locationIds?.length ? { locationId: { in: locationIds } } : {}),
        },
        include: {
          user: { select: { name: true } },
          location: { select: { city: true, name: true } },
        },
        take: 20,
      }),
      prisma.cashierShift.count({
        where: {
          status: { in: ["CLOSED", "FORCE_CLOSED"] },
          closedAt: { gte: from, lte: to },
          ...(locationIds?.length ? { locationId: { in: locationIds } } : {}),
        },
      }),
      prisma.cashierShift.findMany({
        where: {
          cashDifferenceAmount: { not: 0 },
          closedAt: { gte: from },
          ...(locationIds?.length ? { locationId: { in: locationIds } } : {}),
        },
        take: 10,
        include: { user: { select: { name: true } }, location: { select: { city: true } } },
      }),
    ]);

    // Compact hourly series for today
    const hourMap = new Map<string, number>();
    for (let h = 0; h < 24; h += 1) {
      hourMap.set(String(h).padStart(2, "0"), 0);
    }
    for (const o of hourlyOrders) {
      const hour = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(o.createdAt);
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + o.totalAmount);
    }
    const revenueByHour = [...hourMap.entries()].map(([hour, amount]) => ({ hour, amount }));

    void prevFrom;
    void prevTo;
    void tomorrowLocal;

    return apiSuccess({
      kpis: report.kpis,
      comparison: report.comparison,
      charts: {
        revenueByHour,
        onlineVsCashier: {
          online: report.kpis.onlineRevenueKopecks,
          cashier: report.kpis.cashierRevenueKopecks,
        },
        paymentMethods: {
          cash: report.kpis.cashKopecks,
          card: report.kpis.cardKopecks,
          yookassa: report.kpis.yookassaKopecks,
        },
        sessionOccupancy: sessions.map((s) => ({
          id: s.id,
          startsAt: s.startsAt,
          occupancy: s.occupancy,
          status: s.status,
        })),
      },
      sessions,
      alerts,
      shifts: {
        open: openShifts.map((s) => ({
          id: s.id,
          cashierName: s.user.name,
          location: `${s.location.city}`,
          openedAt: s.openedAt,
          cashSalesAmount: s.cashSalesAmount,
          ordersCount: s.ordersCount,
        })),
        closedToday: closedShiftsToday,
        withDifference: diffShifts.map((s) => ({
          id: s.id,
          cashierName: s.user.name,
          location: s.location.city,
          cashDifferenceAmount: s.cashDifferenceAmount,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
