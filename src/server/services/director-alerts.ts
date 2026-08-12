import { prisma } from "@/lib/db/prisma";
import { addDaysUtc } from "@/lib/datetime";

export type DirectorAlert = {
  severity: "info" | "warning" | "danger";
  title: string;
  description: string;
  href: string;
};

export async function getDirectorAlerts(locationIds?: string[]): Promise<DirectorAlert[]> {
  const alerts: DirectorAlert[] = [];
  const now = new Date();
  const in7 = addDaysUtc(now, 7);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const locationFilter = locationIds?.length ? { id: { in: locationIds } } : {};

  const [paused, sessionsSoon, failedPayments, failedEmail, lastCleanup, priceGaps, cashDiffs] =
    await Promise.all([
      prisma.location.count({ where: { ...locationFilter, status: "PAUSED" } }),
      prisma.session.findMany({
        where: {
          ...(locationIds?.length ? { locationId: { in: locationIds } } : {}),
          startsAt: { gte: now, lte: in7 },
          status: { in: ["SCHEDULED", "OPEN"] },
        },
        take: 40,
        include: {
          _count: { select: { tickets: true } },
        },
      }),
      prisma.payment.count({
        where: { status: "FAILED", createdAt: { gte: dayAgo } },
      }),
      prisma.ticketDelivery.count({
        where: { status: "FAILED", createdAt: { gte: dayAgo } },
      }),
      prisma.operationalEvent.findFirst({
        where: { kind: "CRON_CLEANUP", status: "OK" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.location.findMany({
        where: { ...locationFilter, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          priceRules: { select: { id: true }, take: 1 },
        },
      }),
      prisma.cashierShift.findMany({
        where: {
          status: { in: ["CLOSED", "FORCE_CLOSED"] },
          cashDifferenceAmount: { not: 0 },
          closedAt: { gte: dayAgo },
          ...(locationIds?.length ? { locationId: { in: locationIds } } : {}),
        },
        orderBy: { closedAt: "desc" },
        take: 8,
        include: {
          user: { select: { name: true } },
          location: { select: { city: true, name: true } },
        },
      }),
    ]);

  if (paused > 0) {
    alerts.push({
      severity: "warning",
      title: "Пауза локаций",
      description: `${paused} локаций в статусе PAUSED`,
      href: "/director/locations",
    });
  }

  for (const loc of priceGaps) {
    if (loc.priceRules.length === 0) {
      alerts.push({
        severity: "danger",
        title: "Нет прайса",
        description: `${loc.name}: отсутствуют price rules`,
        href: "/director/prices",
      });
    }
  }

  const soldOut = sessionsSoon.filter((s) => s._count.tickets >= s.capacity);
  if (soldOut.length > 0) {
    alerts.push({
      severity: "info",
      title: "Sold out сеансы",
      description: `${soldOut.length} ближайших сеансов заполнены`,
      href: "/director/sessions",
    });
  }

  const futureSessions = await prisma.session.count({
    where: {
      ...(locationIds?.length ? { locationId: { in: locationIds } } : {}),
      startsAt: { gte: now, lte: in7 },
    },
  });
  if (futureSessions === 0) {
    alerts.push({
      severity: "warning",
      title: "Нет расписания",
      description: "На ближайшие 7 дней сеансы не найдены",
      href: "/director/schedule",
    });
  }

  if (failedPayments > 0) {
    alerts.push({
      severity: "danger",
      title: "Ошибки оплаты",
      description: `${failedPayments} FAILED платежей за 24ч`,
      href: "/admin/payments",
    });
  }

  if (failedEmail > 0) {
    alerts.push({
      severity: "warning",
      title: "Ошибки email",
      description: `${failedEmail} FAILED доставок за 24ч`,
      href: "/director/orders",
    });
  }

  if (!lastCleanup || lastCleanup.createdAt.getTime() < Date.now() - 36 * 60 * 60 * 1000) {
    alerts.push({
      severity: "warning",
      title: "Cleanup cron",
      description: lastCleanup
        ? "Последний успешный cleanup давно"
        : "Cleanup ещё не фиксировался",
      href: "/admin/system",
    });
  }

  for (const shift of cashDiffs) {
    const diff = shift.cashDifferenceAmount ?? 0;
    if (diff === 0) continue;
    const shortage = diff < 0;
    const amount = Math.abs(diff);
    const rub = new Intl.NumberFormat("ru-RU").format(amount / 100);
    alerts.push({
      severity: shortage ? "danger" : "warning",
      title: shortage ? `Недостача по смене — ${rub} ₽` : `Излишек по смене — ${rub} ₽`,
      description: `${shift.user.name} · ${shift.location.city} · закрыта ${
        shift.closedAt
          ? new Intl.DateTimeFormat("ru-RU", {
              timeZone: "Europe/Moscow",
              hour: "2-digit",
              minute: "2-digit",
            }).format(shift.closedAt)
          : "—"
      }`,
      href: `/director/shifts/${shift.id}`,
    });
  }

  return alerts.slice(0, 12);
}
