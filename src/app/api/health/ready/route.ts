import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";

/**
 * Readiness: Postgres reachable + required env present.
 * Does NOT call ЮKassa / email providers.
 * Never returns secrets, connection strings, or stack traces.
 */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {
    database: "fail",
    env: "fail",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "fail";
  }

  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.length);
  const hasAppUrl = Boolean(env.NEXT_PUBLIC_APP_URL?.length);
  const hasAuth = Boolean(env.AUTH_SECRET?.length);
  const hasQr = Boolean(env.QR_SIGNING_SECRET?.length);
  checks.env = hasDatabaseUrl && hasAppUrl && hasAuth && hasQr ? "ok" : "fail";

  const ready = checks.database === "ok" && checks.env === "ok";

  return NextResponse.json(
    {
      ok: ready,
      status: ready ? "ready" : "not_ready",
      checks,
      deployEnv: process.env.DEPLOY_ENV || env.NODE_ENV,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
