import type { OrderSource, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { computeAvailability } from "@/server/domain/availability.domain";
import { reservationRepository } from "@/server/repositories/reservation.repository";
import { orderRepository } from "@/server/repositories/order.repository";

export type DirectorAnalyticsParams = {
  from: Date;
  to: Date;
  locationId?: string;
  now?: Date;
};

export type DirectorAnalytics = {
  from: string;
  to: string;
  locationId: string | null;
  /** PAID orders only — never RESERVATION / AWAITING_PAYMENT. */
  revenueKopecks: number;
  refundsKopecks: number;
  netRevenueKopecks: number;
  orderCount: number;
  ticketCount: number;
  averageOrderValueKopecks: number;
  revenueBySource: Record<OrderSource, number>;
  revenueByPaymentMethod: {
    cash: number;
    card: number;
    other: number;
  };
  checkInCount: number;
  cancellationCount: number;
  refundCount: number;
  dailySeries: Array<{
    date: string;
    revenueKopecks: number;
    orderCount: number;
    checkIns: number;
  }>;
  occupancyRate: number;
  upcomingSessions: Array<{
    id: string;
    publicId: string;
    startsAt: string;
    endsAt: string;
    locationId: string;
    locationName: string;
    capacity: number;
    booked: number;
    available: number;
  }>;
};

function orderWhere(params: DirectorAnalyticsParams) {
  return {
    status: "PAID" as const,
    createdAt: { gte: params.from, lte: params.to },
    ...(params.locationId
      ? {
          OR: [{ locationId: params.locationId }, { session: { locationId: params.locationId } }],
        }
      : {}),
  };
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isCardMethod(method: PaymentMethod): boolean {
  return method === "CARD_ONLINE" || method === "CARD_TERMINAL";
}

export async function getDirectorAnalytics(
  params: DirectorAnalyticsParams,
): Promise<DirectorAnalytics> {
  const now = params.now ?? new Date();
  const paidWhere = orderWhere(params);

  const [
    ordersAgg,
    refundsAgg,
    ordersBySource,
    paidTickets,
    sessionsInRange,
    upcomingRaw,
    paidOrders,
    checkIns,
    cancellations,
    refundRows,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      _count: { id: true },
      where: paidWhere,
    }),
    prisma.refund.aggregate({
      _sum: { amount: true },
      where: {
        status: "COMPLETED",
        createdAt: { gte: params.from, lte: params.to },
        ...(params.locationId
          ? {
              order: {
                OR: [
                  { locationId: params.locationId },
                  { session: { locationId: params.locationId } },
                ],
              },
            }
          : {}),
      },
    }),
    prisma.order.groupBy({
      by: ["source"],
      _sum: { totalAmount: true },
      where: paidWhere,
    }),
    prisma.ticket.count({
      where: {
        order: paidWhere,
        status: { in: ["VALID", "USED"] },
      },
    }),
    prisma.session.findMany({
      where: {
        startsAt: { gte: params.from, lte: params.to },
        ...(params.locationId ? { locationId: params.locationId } : {}),
        status: { not: "CANCELLED" },
      },
      select: { id: true, capacity: true },
    }),
    prisma.session.findMany({
      where: {
        startsAt: { gte: now },
        ...(params.locationId ? { locationId: params.locationId } : {}),
        status: { in: ["SCHEDULED", "OPEN"] },
      },
      orderBy: { startsAt: "asc" },
      take: 8,
      include: { location: { select: { id: true, name: true } } },
    }),
    prisma.order.findMany({
      where: paidWhere,
      select: {
        createdAt: true,
        totalAmount: true,
        payments: {
          where: { status: { in: ["SUCCEEDED", "REFUNDED"] } },
          select: { method: true, amount: true, status: true },
        },
      },
    }),
    prisma.ticketCheckIn.count({
      where: {
        result: "SUCCESS",
        scannedAt: { gte: params.from, lte: params.to },
        ...(params.locationId
          ? { ticket: { session: { locationId: params.locationId } } }
          : {}),
      },
    }),
    prisma.order.count({
      where: {
        status: "CANCELLED",
        updatedAt: { gte: params.from, lte: params.to },
        ...(params.locationId
          ? {
              OR: [
                { locationId: params.locationId },
                { session: { locationId: params.locationId } },
              ],
            }
          : {}),
      },
    }),
    prisma.refund.findMany({
      where: {
        status: "COMPLETED",
        createdAt: { gte: params.from, lte: params.to },
        ...(params.locationId
          ? {
              order: {
                OR: [
                  { locationId: params.locationId },
                  { session: { locationId: params.locationId } },
                ],
              },
            }
          : {}),
      },
      select: { id: true },
    }),
  ]);

  const revenueKopecks = ordersAgg._sum.totalAmount ?? 0;
  const refundsKopecks = refundsAgg._sum.amount ?? 0;
  const orderCount = ordersAgg._count.id;
  const averageOrderValueKopecks = orderCount > 0 ? Math.round(revenueKopecks / orderCount) : 0;

  const revenueBySource: Record<OrderSource, number> = { ONLINE: 0, CASHIER: 0 };
  for (const row of ordersBySource) {
    revenueBySource[row.source] = row._sum.totalAmount ?? 0;
  }

  const revenueByPaymentMethod = { cash: 0, card: 0, other: 0 };
  const dailyMap = new Map<string, { revenueKopecks: number; orderCount: number; checkIns: number }>();

  for (const order of paidOrders) {
    const key = toDateKey(order.createdAt);
    const bucket = dailyMap.get(key) ?? { revenueKopecks: 0, orderCount: 0, checkIns: 0 };
    bucket.revenueKopecks += order.totalAmount;
    bucket.orderCount += 1;
    dailyMap.set(key, bucket);

    const succeeded = order.payments.filter((p) => p.status === "SUCCEEDED" || p.status === "REFUNDED");
    if (succeeded.length === 0) {
      revenueByPaymentMethod.other += order.totalAmount;
      continue;
    }
    for (const payment of succeeded) {
      if (payment.method === "CASH") revenueByPaymentMethod.cash += payment.amount;
      else if (isCardMethod(payment.method)) revenueByPaymentMethod.card += payment.amount;
      else revenueByPaymentMethod.other += payment.amount;
    }
  }

  const checkInRows = await prisma.ticketCheckIn.findMany({
    where: {
      result: "SUCCESS",
      scannedAt: { gte: params.from, lte: params.to },
      ...(params.locationId
        ? { ticket: { session: { locationId: params.locationId } } }
        : {}),
    },
    select: { scannedAt: true },
  });
  for (const row of checkInRows) {
    const key = toDateKey(row.scannedAt);
    const bucket = dailyMap.get(key) ?? { revenueKopecks: 0, orderCount: 0, checkIns: 0 };
    bucket.checkIns += 1;
    dailyMap.set(key, bucket);
  }

  const dailySeries = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));

  let totalCapacity = 0;
  let totalBooked = 0;
  if (sessionsInRange.length > 0) {
    const sessionIds = sessionsInRange.map((s) => s.id);
    const [activeReservations, occupyingOrders] = await Promise.all([
      reservationRepository.findActiveForSessions(prisma, sessionIds, now),
      orderRepository.findOccupyingForSessions(prisma, sessionIds),
    ]);

    const reservedBySession = new Map<string, number>();
    for (const reservation of activeReservations) {
      const qty = reservation.items.reduce((sum, item) => sum + item.quantity, 0);
      reservedBySession.set(
        reservation.sessionId,
        (reservedBySession.get(reservation.sessionId) ?? 0) + qty,
      );
    }
    const orderedBySession = new Map<string, number>();
    for (const order of occupyingOrders) {
      const qty = order.items.reduce((sum, item) => sum + item.quantity, 0);
      orderedBySession.set(order.sessionId, (orderedBySession.get(order.sessionId) ?? 0) + qty);
    }

    for (const session of sessionsInRange) {
      const availability = computeAvailability({
        sessionId: session.id,
        capacity: session.capacity,
        reservedQuantity: reservedBySession.get(session.id) ?? 0,
        orderedQuantity: orderedBySession.get(session.id) ?? 0,
      });
      totalCapacity += availability.capacity;
      totalBooked += availability.booked;
    }
  }

  const occupancyRate = totalCapacity > 0 ? totalBooked / totalCapacity : 0;

  const upcomingSessions = await Promise.all(
    upcomingRaw.map(async (session) => {
      const [reservedQuantity, orderedQuantity] = await Promise.all([
        reservationRepository.aggregateReservedQuantity(prisma, session.id, now),
        orderRepository.aggregateOrderedQuantity(prisma, session.id),
      ]);
      const availability = computeAvailability({
        sessionId: session.id,
        capacity: session.capacity,
        reservedQuantity,
        orderedQuantity,
      });
      return {
        id: session.id,
        publicId: session.publicId,
        startsAt: session.startsAt.toISOString(),
        endsAt: session.endsAt.toISOString(),
        locationId: session.locationId,
        locationName: session.location.name,
        capacity: availability.capacity,
        booked: availability.booked,
        available: availability.available,
      };
    }),
  );

  return {
    from: params.from.toISOString(),
    to: params.to.toISOString(),
    locationId: params.locationId ?? null,
    revenueKopecks,
    refundsKopecks,
    netRevenueKopecks: Math.max(0, revenueKopecks - refundsKopecks),
    orderCount,
    ticketCount: paidTickets,
    averageOrderValueKopecks,
    revenueBySource,
    revenueByPaymentMethod,
    checkInCount: checkIns,
    cancellationCount: cancellations,
    refundCount: refundRows.length,
    dailySeries,
    occupancyRate,
    upcomingSessions,
  };
}

/** Pure helper for unit tests — PAID-only revenue aggregation. */
export function sumPaidRevenueKopecks(
  orders: Array<{ status: string; totalAmount: number }>,
): number {
  return orders
    .filter((order) => order.status === "PAID")
    .reduce((sum, order) => sum + order.totalAmount, 0);
}
