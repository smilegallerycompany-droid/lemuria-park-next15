import type { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { formatDateInTimezone, formatTimeInTimezone } from "@/lib/datetime";
import {
  averageOrderValueKopecks,
  averageTicketPriceKopecks,
  compareKpi,
  comparisonWindow,
  ratePercent,
  reservationConversionRate,
  type KpiComparison,
} from "@/server/services/analytics-formulas";

export type AnalyticsSourceFilter = "ALL" | "ONLINE" | "CASHIER";
export type AnalyticsPaymentFilter = "ALL" | "CASH" | "CARD" | "YOOKASSA";

export type AnalyticsReportParams = {
  from: Date;
  to: Date;
  locationId?: string;
  /** When set, restricts all location filters to this set (including empty = none). */
  locationIds?: string[];
  source?: AnalyticsSourceFilter;
  paymentMethod?: AnalyticsPaymentFilter;
  ticketTypeId?: string;
  cashierId?: string;
  timeZone?: string;
  now?: Date;
};

function locationIdList(params: AnalyticsReportParams): string[] | undefined {
  if (params.locationIds) return params.locationIds;
  if (params.locationId) return [params.locationId];
  return undefined;
}

function mapPaymentFilter(filter: AnalyticsPaymentFilter | undefined): PaymentMethod[] | null {
  if (!filter || filter === "ALL") return null;
  if (filter === "CASH") return ["CASH"];
  if (filter === "CARD") return ["CARD_TERMINAL"];
  return ["CARD_ONLINE"]; // YOOKASSA / site
}

function paidOrderWhere(params: AnalyticsReportParams): Prisma.OrderWhereInput {
  const paymentMethods = mapPaymentFilter(params.paymentMethod);
  const locations = locationIdList(params);
  return {
    status: "PAID",
    createdAt: { gte: params.from, lte: params.to },
    ...(locations
      ? {
          OR: [{ locationId: { in: locations } }, { session: { locationId: { in: locations } } }],
        }
      : {}),
    ...(params.source && params.source !== "ALL" ? { source: params.source } : {}),
    ...(params.cashierId ? { cashierId: params.cashierId } : {}),
    ...(params.ticketTypeId
      ? { items: { some: { ticketTypeId: params.ticketTypeId } } }
      : {}),
    ...(paymentMethods
      ? {
          payments: {
            some: { status: "SUCCEEDED", method: { in: paymentMethods } },
          },
        }
      : {}),
  };
}

async function kpiBundle(params: AnalyticsReportParams) {
  const where = paidOrderWhere(params);
  const tz = params.timeZone ?? "Europe/Moscow";

  const locations = locationIdList(params);
  const locationScope = locations
    ? {
        OR: [{ locationId: { in: locations } }, { session: { locationId: { in: locations } } }],
      }
    : {};

  const [
    ordersAgg,
    refundsAgg,
    ticketsSold,
    checkIns,
    checkInsRefunded,
    cancelledOrders,
    refundedOrders,
    bySource,
    payments,
    noShowTickets,
    reservationsCreated,
    paidFromReservations,
  ] = await Promise.all([
    prisma.order.aggregate({
      where,
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    prisma.refund.aggregate({
      _sum: { amount: true },
      where: {
        status: { in: ["COMPLETED", "SUCCEEDED"] },
        createdAt: { gte: params.from, lte: params.to },
        order: where,
      },
    }),
    prisma.ticket.count({
      where: {
        order: where,
        status: { in: ["VALID", "USED"] },
        ...(params.ticketTypeId ? { ticketTypeId: params.ticketTypeId } : {}),
      },
    }),
    prisma.ticketCheckIn.count({
      where: {
        result: "SUCCESS",
        scannedAt: { gte: params.from, lte: params.to },
        ticket: {
          order: where,
          ...(locations ? { session: { locationId: { in: locations } } } : {}),
        },
      },
    }),
    prisma.ticketCheckIn.count({
      where: {
        result: "REFUNDED",
        scannedAt: { gte: params.from, lte: params.to },
        ticket: {
          ...(locations ? { session: { locationId: { in: locations } } } : {}),
        },
      },
    }),
    prisma.order.count({
      where: {
        status: "CANCELLED",
        updatedAt: { gte: params.from, lte: params.to },
        ...locationScope,
        ...(params.source && params.source !== "ALL" ? { source: params.source } : {}),
      },
    }),
    prisma.order.count({
      where: {
        status: "REFUNDED",
        updatedAt: { gte: params.from, lte: params.to },
        ...(locations
          ? {
              OR: [
                { locationId: { in: locations } },
                { session: { locationId: { in: locations } } },
              ],
            }
          : {}),
      },
    }),
    prisma.order.groupBy({
      by: ["source"],
      where,
      _sum: { totalAmount: true },
    }),
    prisma.payment.groupBy({
      by: ["method"],
      where: {
        status: "SUCCEEDED",
        order: where,
      },
      _sum: { amount: true },
    }),
    // No-show: past sessions, VALID unpaid-check-in tickets on PAID orders
    prisma.ticket.count({
      where: {
        status: "VALID",
        order: where,
        session: {
          endsAt: { lt: params.now ?? new Date() },
          ...(locations ? { locationId: { in: locations } } : {}),
        },
        checkIns: { none: { result: "SUCCESS" } },
      },
    }),
    prisma.reservation.count({
      where: {
        createdAt: { gte: params.from, lte: params.to },
        ...(locations ? { session: { locationId: { in: locations } } } : {}),
      },
    }),
    prisma.order.count({
      where: {
        ...where,
        reservationId: { not: null },
      },
    }),
  ]);

  const sessions = await prisma.session.findMany({
    where: {
      startsAt: { gte: params.from, lte: params.to },
      status: { not: "CANCELLED" },
      ...(locationIdList(params) ? { locationId: { in: locationIdList(params)! } } : {}),
    },
    select: { id: true, capacity: true, startsAt: true },
  });
  const capacity = sessions.reduce((sum, s) => sum + s.capacity, 0);

  const soldSeats = await prisma.orderItem.aggregate({
    where: { order: where },
    _sum: { quantity: true },
  });
  const paidSeats = soldSeats._sum.quantity ?? 0;

  const gross = ordersAgg._sum.totalAmount ?? 0;
  const refunded = refundsAgg._sum.amount ?? 0;
  const net = Math.max(0, gross - refunded);
  const paidOrders = ordersAgg._count.id;

  let cash = 0;
  let card = 0;
  let yookassa = 0;
  for (const row of payments) {
    const amount = row._sum.amount ?? 0;
    if (row.method === "CASH") cash += amount;
    else if (row.method === "CARD_TERMINAL") card += amount;
    else if (row.method === "CARD_ONLINE") yookassa += amount;
  }

  let online = 0;
  let cashier = 0;
  for (const row of bySource) {
    if (row.source === "ONLINE") online = row._sum.totalAmount ?? 0;
    if (row.source === "CASHIER") cashier = row._sum.totalAmount ?? 0;
  }

  const attendanceRate = ratePercent(checkIns, ticketsSold);
  const occupancyRate = ratePercent(paidSeats, capacity);

  return {
    tz,
    kpis: {
      grossRevenueKopecks: gross,
      refundedAmountKopecks: refunded,
      netRevenueKopecks: net,
      paidOrders,
      ticketsSold,
      averageOrderValueKopecks: averageOrderValueKopecks(net, paidOrders),
      averageTicketPriceKopecks: averageTicketPriceKopecks(net, ticketsSold),
      checkIns,
      checkInsRefunded,
      attendanceRate,
      occupancyRate,
      onlineRevenueKopecks: online,
      cashierRevenueKopecks: cashier,
      cashKopecks: cash,
      cardKopecks: card,
      yookassaKopecks: yookassa,
      cancelledOrders,
      refundedOrders,
      noShow: noShowTickets,
      availableCapacity: capacity,
      paidSeats,
      reservationConversionRate: reservationConversionRate(
        paidFromReservations,
        reservationsCreated,
      ),
      reservationsCreated,
      paidFromReservations,
    },
    sessionsMeta: sessions,
  };
}

export async function getDirectorAnalyticsReport(params: AnalyticsReportParams) {
  const now = params.now ?? new Date();
  const timeZone = params.timeZone ?? "Europe/Moscow";
  const currentParams = { ...params, now, timeZone };
  const prev = comparisonWindow(params.from, params.to);
  const previousParams = { ...params, from: prev.from, to: prev.to, now, timeZone };

  const [current, previous] = await Promise.all([
    kpiBundle(currentParams),
    kpiBundle(previousParams),
  ]);

  const comparison: Record<string, KpiComparison> = {};
  for (const key of Object.keys(current.kpis) as Array<keyof typeof current.kpis>) {
    comparison[key] = compareKpi(current.kpis[key], previous.kpis[key]);
  }

  const where = paidOrderWhere(currentParams);

  const [ordersForSeries, ticketTypes, sessionOrders, locationsAgg] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        createdAt: true,
        totalAmount: true,
        source: true,
        cashierId: true,
        locationId: true,
        items: {
          select: {
            quantity: true,
            ticketTypeId: true,
            ticketTypeName: true,
            subtotalAmount: true,
          },
        },
        payments: { where: { status: "SUCCEEDED" }, select: { method: true, amount: true } },
        tickets: {
          select: {
            id: true,
            checkIns: { where: { result: "SUCCESS" }, select: { id: true }, take: 1 },
          },
        },
        session: { select: { id: true, startsAt: true, capacity: true, locationId: true } },
        cashier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      take: 20_000,
    }),
    prisma.ticketType.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    }),
    prisma.session.findMany({
      where: {
        startsAt: { gte: params.from, lte: params.to },
        status: { not: "CANCELLED" },
        ...(locationIdList(params) ? { locationId: { in: locationIdList(params)! } } : {}),
      },
      select: {
        id: true,
        startsAt: true,
        capacity: true,
        locationId: true,
        location: { select: { name: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 500,
    }),
    prisma.location.findMany({
      where: locationIdList(params)
        ? { id: { in: locationIdList(params)! } }
        : { status: "ACTIVE" },
      select: { id: true, name: true },
    }),
  ]);

  // Daily series
  const revenueMap = new Map<string, { total: number; online: number; cashier: number; orders: number; tickets: number }>();
  const ticketTypeMap = new Map<string, { name: string; quantity: number; revenueKopecks: number }>();
  const timeMap = new Map<string, { sold: number; capacity: number }>();
  const weekdayMap = new Map<string, { sold: number; capacity: number }>();
  const sessionSold = new Map<string, { online: number; cashier: number; revenue: number; checkIns: number }>();
  const cashierMap = new Map<
    string,
    { name: string; orders: number; tickets: number; cash: number; card: number; site: number; revenue: number }
  >();
  const locationMap = new Map<
    string,
    { name: string; revenue: number; tickets: number; orders: number; checkIns: number }
  >();

  for (const tt of ticketTypes) {
    ticketTypeMap.set(tt.id, { name: tt.name, quantity: 0, revenueKopecks: 0 });
  }

  for (const session of sessionOrders) {
    const time = formatTimeInTimezone(session.startsAt, timeZone);
    const weekday = new Intl.DateTimeFormat("ru-RU", { timeZone, weekday: "short" }).format(
      session.startsAt,
    );
    const tBucket = timeMap.get(time) ?? { sold: 0, capacity: 0 };
    tBucket.capacity += session.capacity;
    timeMap.set(time, tBucket);
    const wBucket = weekdayMap.get(weekday) ?? { sold: 0, capacity: 0 };
    wBucket.capacity += session.capacity;
    weekdayMap.set(weekday, wBucket);
    sessionSold.set(session.id, { online: 0, cashier: 0, revenue: 0, checkIns: 0 });
  }

  for (const order of ordersForSeries) {
    const date = formatDateInTimezone(order.createdAt, timeZone);
    const day = revenueMap.get(date) ?? { total: 0, online: 0, cashier: 0, orders: 0, tickets: 0 };
    day.total += order.totalAmount;
    day.orders += 1;
    if (order.source === "ONLINE") day.online += order.totalAmount;
    else day.cashier += order.totalAmount;

    let ticketQty = 0;
    for (const item of order.items) {
      ticketQty += item.quantity;
      const tt = ticketTypeMap.get(item.ticketTypeId) ?? {
        name: item.ticketTypeName,
        quantity: 0,
        revenueKopecks: 0,
      };
      tt.quantity += item.quantity;
      tt.revenueKopecks += item.subtotalAmount;
      ticketTypeMap.set(item.ticketTypeId, tt);
    }
    day.tickets += ticketQty;
    revenueMap.set(date, day);

    const sid = order.session.id;
    const sBucket = sessionSold.get(sid) ?? { online: 0, cashier: 0, revenue: 0, checkIns: 0 };
    if (order.source === "ONLINE") sBucket.online += ticketQty;
    else sBucket.cashier += ticketQty;
    sBucket.revenue += order.totalAmount;
    sBucket.checkIns += order.tickets.filter((t) => t.checkIns.length > 0).length;
    sessionSold.set(sid, sBucket);

    const time = formatTimeInTimezone(order.session.startsAt, timeZone);
    const weekday = new Intl.DateTimeFormat("ru-RU", { timeZone, weekday: "short" }).format(
      order.session.startsAt,
    );
    const tBucket = timeMap.get(time) ?? { sold: 0, capacity: 0 };
    tBucket.sold += ticketQty;
    timeMap.set(time, tBucket);
    const wBucket = weekdayMap.get(weekday) ?? { sold: 0, capacity: 0 };
    wBucket.sold += ticketQty;
    weekdayMap.set(weekday, wBucket);

    const locId = order.locationId ?? order.session.locationId;
    const locName = order.location?.name ?? "—";
    const loc = locationMap.get(locId) ?? {
      name: locName,
      revenue: 0,
      tickets: 0,
      orders: 0,
      checkIns: 0,
    };
    loc.revenue += order.totalAmount;
    loc.tickets += ticketQty;
    loc.orders += 1;
    loc.checkIns += order.tickets.filter((t) => t.checkIns.length > 0).length;
    locationMap.set(locId, loc);

    if (order.cashierId && order.cashier) {
      const c =
        cashierMap.get(order.cashierId) ?? {
          name: order.cashier.name,
          orders: 0,
          tickets: 0,
          cash: 0,
          card: 0,
          site: 0,
          revenue: 0,
        };
      c.orders += 1;
      c.tickets += ticketQty;
      c.revenue += order.totalAmount;
      for (const p of order.payments) {
        if (p.method === "CASH") c.cash += p.amount;
        else if (p.method === "CARD_TERMINAL") c.card += p.amount;
        else if (p.method === "CARD_ONLINE") c.site += p.amount;
      }
      cashierMap.set(order.cashierId, c);
    }
  }

  // Seed location names for empty
  for (const loc of locationsAgg) {
    if (!locationMap.has(loc.id)) {
      locationMap.set(loc.id, {
        name: loc.name,
        revenue: 0,
        tickets: 0,
        orders: 0,
        checkIns: 0,
      });
    }
  }

  const ticketTypeBreakdown = Array.from(ticketTypeMap.entries())
    .map(([ticketTypeId, row]) => ({
      ticketTypeId,
      name: row.name,
      quantity: row.quantity,
      revenueKopecks: row.revenueKopecks,
      avgPriceKopecks: row.quantity > 0 ? Math.round(row.revenueKopecks / row.quantity) : 0,
      share: ratePercent(row.revenueKopecks, current.kpis.grossRevenueKopecks),
    }))
    .filter((row) => row.quantity > 0)
    .sort((a, b) => b.revenueKopecks - a.revenueKopecks);

  const sessions = sessionOrders.map((session) => {
    const sold = sessionSold.get(session.id) ?? { online: 0, cashier: 0, revenue: 0, checkIns: 0 };
    const totalSold = sold.online + sold.cashier;
    return {
      id: session.id,
      date: formatDateInTimezone(session.startsAt, timeZone),
      time: formatTimeInTimezone(session.startsAt, timeZone),
      capacity: session.capacity,
      onlineSold: sold.online,
      cashierSold: sold.cashier,
      totalSold,
      checkIns: sold.checkIns,
      available: Math.max(0, session.capacity - totalSold),
      occupancy: ratePercent(totalSold, session.capacity),
      revenueKopecks: sold.revenue,
      locationName: session.location.name,
    };
  });

  // Heatmap cells weekday × time
  const heatmap: Array<{ weekday: string; time: string; occupancy: number; sold: number; capacity: number }> =
    [];
  for (const session of sessionOrders) {
    const weekday = new Intl.DateTimeFormat("ru-RU", { timeZone, weekday: "short" }).format(
      session.startsAt,
    );
    const time = formatTimeInTimezone(session.startsAt, timeZone);
    const sold = sessionSold.get(session.id);
    const totalSold = sold ? sold.online + sold.cashier : 0;
    heatmap.push({
      weekday,
      time,
      sold: totalSold,
      capacity: session.capacity,
      occupancy: ratePercent(totalSold, session.capacity),
    });
  }

  return {
    period: { from: params.from.toISOString(), to: params.to.toISOString(), timeZone },
    comparisonPeriod: { from: prev.from.toISOString(), to: prev.to.toISOString() },
    kpis: current.kpis,
    comparison,
    revenueSeries: Array.from(revenueMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({
        date,
        total: row.total,
        online: row.online,
        cashier: row.cashier,
      })),
    ordersSeries: Array.from(revenueMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({
        date,
        orders: row.orders,
        tickets: row.tickets,
      })),
    sourceBreakdown: [
      { key: "ONLINE", label: "Онлайн", valueKopecks: current.kpis.onlineRevenueKopecks },
      { key: "CASHIER", label: "Касса", valueKopecks: current.kpis.cashierRevenueKopecks },
    ],
    paymentBreakdown: [
      { key: "CASH", label: "Наличные", valueKopecks: current.kpis.cashKopecks },
      { key: "CARD", label: "Карта", valueKopecks: current.kpis.cardKopecks },
      { key: "YOOKASSA", label: "ЮKassa / Сайт", valueKopecks: current.kpis.yookassaKopecks },
    ],
    timeOccupancy: Array.from(timeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, row]) => ({
        time,
        sold: row.sold,
        capacity: row.capacity,
        occupancy: ratePercent(row.sold, row.capacity),
      })),
    weekdayOccupancy: Array.from(weekdayMap.entries()).map(([weekday, row]) => ({
      weekday,
      sold: row.sold,
      capacity: row.capacity,
      occupancy: ratePercent(row.sold, row.capacity),
    })),
    ticketTypeBreakdown,
    attendance: {
      checkIns: current.kpis.checkIns,
      validTickets: current.kpis.ticketsSold,
      noShow: current.kpis.noShow,
      attendanceRate: current.kpis.attendanceRate,
    },
    cashiers: Array.from(cashierMap.entries()).map(([userId, row]) => ({
      userId,
      name: row.name,
      orders: row.orders,
      tickets: row.tickets,
      cashKopecks: row.cash,
      cardKopecks: row.card,
      siteKopecks: row.site,
      revenueKopecks: row.revenue,
      aovKopecks: averageOrderValueKopecks(row.revenue, row.orders),
    })),
    sessions,
    locations: Array.from(locationMap.entries()).map(([locationId, row]) => ({
      locationId,
      name: row.name,
      revenueKopecks: row.revenue,
      tickets: row.tickets,
      orders: row.orders,
      aovKopecks: averageOrderValueKopecks(row.revenue, row.orders),
      occupancy: 0,
      checkIns: row.checkIns,
    })),
    heatmap,
  };
}
