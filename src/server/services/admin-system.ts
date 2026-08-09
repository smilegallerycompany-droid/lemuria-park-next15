import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import { getMediaStorageStatus } from "@/server/media/storage";

export type SystemComponentStatus = "OK" | "WARNING" | "ERROR" | "NOT_CONFIGURED" | "UNKNOWN";

export type SystemComponent = {
  key: string;
  label: string;
  status: SystemComponentStatus;
  lastSuccessfulAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  detail?: string | null;
};

function sanitizeMessage(msg: string | null | undefined): string | null {
  if (!msg) return null;
  return msg
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/sk_[a-zA-Z0-9]+/g, "[redacted]")
    .replace(/password[=:]\s*\S+/gi, "password=[redacted]")
    .slice(0, 240);
}

async function latestOps(kind: string) {
  const [ok, err] = await Promise.all([
    prisma.operationalEvent.findFirst({
      where: { kind, status: "OK" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.operationalEvent.findFirst({
      where: { kind, status: { in: ["ERROR", "FAILED"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { ok, err };
}

export async function getAdminSystemHealth(): Promise<{ components: SystemComponent[] }> {
  let database: SystemComponentStatus = "OK";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "ERROR";
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    paymentOk,
    paymentErr,
    emailOk,
    emailErr,
    cron,
    webhook,
    failedPayments24h,
    lastPayment,
  ] = await Promise.all([
    latestOps("PAYMENT"),
    prisma.operationalEvent.findFirst({
      where: { kind: { contains: "PAYMENT" }, status: { in: ["ERROR", "FAILED"] } },
      orderBy: { createdAt: "desc" },
    }),
    latestOps("EMAIL"),
    prisma.ticketDelivery.findFirst({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
    }),
    latestOps("CRON_CLEANUP"),
    latestOps("YOOKASSA_WEBHOOK"),
    prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: dayAgo } } }),
    prisma.payment.findFirst({
      where: { status: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const paymentConfigured = Boolean(env.YUKASSA_SHOP_ID && env.YUKASSA_SECRET_KEY);
  const emailConfigured = env.EMAIL_PROVIDER === "yandex_postbox";
  const mapsConfigured = Boolean(process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY);
  const errorMonConfigured = Boolean(env.ERROR_MONITORING_DSN);
  const storageStatus = getMediaStorageStatus();

  const components: SystemComponent[] = [
    {
      key: "database",
      label: "Database",
      status: database,
      lastSuccessfulAt: database === "OK" ? new Date().toISOString() : null,
      lastErrorAt: database === "ERROR" ? new Date().toISOString() : null,
      lastErrorMessage: database === "ERROR" ? "Database query failed" : null,
    },
    {
      key: "payment",
      label: "Payment",
      status: !paymentConfigured
        ? "NOT_CONFIGURED"
        : failedPayments24h > 0
          ? "WARNING"
          : "OK",
      lastSuccessfulAt: lastPayment?.createdAt.toISOString() ?? paymentOk.ok?.createdAt.toISOString() ?? null,
      lastErrorAt: paymentErr?.createdAt.toISOString() ?? null,
      lastErrorMessage: sanitizeMessage(paymentErr?.message),
      detail: paymentConfigured ? "YooKassa credentials present" : null,
    },
    {
      key: "email",
      label: "Email",
      status: !emailConfigured
        ? "NOT_CONFIGURED"
        : emailErr
          ? "WARNING"
          : "OK",
      lastSuccessfulAt: emailOk.ok?.createdAt.toISOString() ?? null,
      lastErrorAt: emailErr?.createdAt.toISOString() ?? null,
      lastErrorMessage: sanitizeMessage(emailErr?.errorMessage),
    },
    {
      key: "cron",
      label: "Cron",
      status: !cron.ok
        ? "UNKNOWN"
        : cron.ok.createdAt.getTime() < Date.now() - 36 * 60 * 60 * 1000
          ? "WARNING"
          : "OK",
      lastSuccessfulAt: cron.ok?.createdAt.toISOString() ?? null,
      lastErrorAt: cron.err?.createdAt.toISOString() ?? null,
      lastErrorMessage: sanitizeMessage(cron.err?.message),
    },
    {
      key: "webhook",
      label: "Webhook",
      status: !webhook.ok && !webhook.err ? "UNKNOWN" : webhook.err ? "WARNING" : "OK",
      lastSuccessfulAt: webhook.ok?.createdAt.toISOString() ?? null,
      lastErrorAt: webhook.err?.createdAt.toISOString() ?? null,
      lastErrorMessage: sanitizeMessage(webhook.err?.message),
    },
    {
      key: "storage",
      label: "Storage",
      status:
        storageStatus === "NOT_CONFIGURED"
          ? "NOT_CONFIGURED"
          : storageStatus === "LOCAL_DEV"
            ? "OK"
            : "OK",
      lastSuccessfulAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      detail: storageStatus,
    },
    {
      key: "maps",
      label: "Maps",
      status: mapsConfigured ? "OK" : "NOT_CONFIGURED",
      lastSuccessfulAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      detail: mapsConfigured
        ? "Yandex Maps public key present"
        : "Public map fallback active",
    },
    {
      key: "error_monitoring",
      label: "Error monitoring",
      status: errorMonConfigured ? "OK" : "NOT_CONFIGURED",
      lastSuccessfulAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  ];

  return { components };
}
