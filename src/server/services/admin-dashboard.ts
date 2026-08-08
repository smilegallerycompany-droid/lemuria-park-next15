import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";

function maskTail(value: string | undefined | null, visible = 4) {
  if (!value) return null;
  if (value.length <= visible) return "****";
  return `****${value.slice(-visible)}`;
}

export async function getAdminDashboard() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    locationsByStatus,
    usersByRole,
    disabledUsers,
    ordersToday,
    paidToday,
    awaiting,
    cancelledToday,
    refundedToday,
    paymentsSucceeded,
    paymentsPending,
    paymentsFailed,
    ticketsIssued,
    ticketsUsed,
    ticketsCancelled,
    ticketsRefunded,
    lastPayment,
    lastCheckIn,
    recentOps,
  ] = await Promise.all([
    prisma.location.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.user.count({ where: { status: "DISABLED" } }),
    prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.order.count({ where: { status: "PAID", createdAt: { gte: startOfDay } } }),
    prisma.order.count({ where: { status: "AWAITING_PAYMENT" } }),
    prisma.order.count({ where: { status: "CANCELLED", updatedAt: { gte: startOfDay } } }),
    prisma.order.count({ where: { status: "REFUNDED", updatedAt: { gte: startOfDay } } }),
    prisma.payment.count({ where: { status: "SUCCEEDED", createdAt: { gte: startOfDay } } }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: dayAgo } } }),
    prisma.ticket.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.ticket.count({ where: { status: "USED", usedAt: { gte: startOfDay } } }),
    prisma.ticket.count({ where: { status: "CANCELLED" } }),
    prisma.ticket.count({ where: { status: "REFUNDED" } }),
    prisma.payment.findFirst({
      where: { status: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, amount: true, providerPaymentId: true },
    }),
    prisma.ticketCheckIn.findFirst({
      where: { result: "SUCCESS" },
      orderBy: { scannedAt: "desc" },
      select: { id: true, scannedAt: true },
    }),
    prisma.operationalEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const lastCleanup = recentOps.find((e) => e.kind === "CRON_CLEANUP");
  const lastWebhook = recentOps.find((e) => e.kind === "YOOKASSA_WEBHOOK");
  const errorCount24h = recentOps.filter(
    (e) => e.status === "ERROR" && e.createdAt.getTime() >= dayAgo.getTime(),
  ).length;

  let database: "Connected" | "Error" = "Connected";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "Error";
  }

  return {
    locations: Object.fromEntries(locationsByStatus.map((r) => [r.status, r._count._all])),
    users: {
      ...Object.fromEntries(usersByRole.map((r) => [r.role, r._count._all])),
      DISABLED: disabledUsers,
    },
    sales: {
      ordersToday,
      paidToday,
      awaitingPayment: awaiting,
      cancelledToday,
      refundedToday,
    },
    payments: {
      succeededToday: paymentsSucceeded,
      pending: paymentsPending,
      failed24h: paymentsFailed,
    },
    tickets: {
      issuedToday: ticketsIssued,
      usedToday: ticketsUsed,
      cancelled: ticketsCancelled,
      refunded: ticketsRefunded,
    },
    system: {
      database,
      payment: env.YUKASSA_SHOP_ID && env.YUKASSA_SECRET_KEY ? "Configured" : "Not configured",
      paymentShopIdMasked: maskTail(env.YUKASSA_SHOP_ID),
      email: env.EMAIL_PROVIDER === "yandex_postbox" ? "Configured" : "Not configured",
      lastCleanupAt: lastCleanup?.createdAt ?? null,
      lastWebhookAt: lastWebhook?.createdAt ?? null,
      lastSuccessfulPaymentAt: lastPayment?.createdAt ?? null,
      lastCheckInAt: lastCheckIn?.scannedAt ?? null,
      errors24h: errorCount24h,
    },
  };
}

export async function getIntegrationsStatus() {
  return {
    yookassa: {
      status: env.YUKASSA_SHOP_ID && env.YUKASSA_SECRET_KEY ? "Configured" : "Not configured",
      shopIdMasked: maskTail(env.YUKASSA_SHOP_ID),
    },
    postbox: {
      status: env.EMAIL_PROVIDER === "yandex_postbox" ? "Configured" : "Not configured",
    },
    maps: {
      status: process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ? "Configured" : "Not configured",
    },
    errorMonitoring: {
      status: env.ERROR_MONITORING_DSN ? "Configured" : "Not configured",
    },
  };
}
