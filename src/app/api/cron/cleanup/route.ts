import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";
import { readRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";
import { getErrorReporter } from "@/server/monitoring/error-reporter";
import { expireStaleReservations } from "@/server/services/reservation-cleanup";
import { expireStalePaymentOrders } from "@/server/services/order-cleanup";

function authorizeCron(request: Request): boolean {
  const expected = env.CRON_SECRET;
  if (!expected || expected.length < 16) {
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const alt = request.headers.get("x-cron-secret") ?? "";
  const provided = bearer || alt;
  if (!provided || provided.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Protected cleanup: expire stale reservations + awaiting-payment orders.
 * Idempotent. Requires CRON_SECRET via Authorization: Bearer or x-cron-secret.
 */
export async function POST(request: Request) {
  const requestId = readRequestId(request);
  const headers = {
    "Cache-Control": "no-store",
    [REQUEST_ID_HEADER]: requestId,
    "X-Robots-Tag": "noindex, nofollow",
  };

  if (!authorizeCron(request)) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Неверный или отсутствующий CRON_SECRET" } },
      { status: 401, headers },
    );
  }

  try {
    const now = new Date();
    const [reservations, orders] = await Promise.all([
      expireStaleReservations(prisma, now),
      expireStalePaymentOrders(prisma, now),
    ]);

    return NextResponse.json(
      {
        ok: true,
        data: {
          expiredReservations: reservations.expiredCount,
          expiredOrders: orders.expiredCount,
          at: now.toISOString(),
        },
      },
      { status: 200, headers },
    );
  } catch (error) {
    getErrorReporter().captureException(error, {
      event: "CRON_CLEANUP_FAILED",
      tags: { requestId },
    });
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Ошибка очистки" } },
      { status: 500, headers },
    );
  }
}

export async function GET(request: Request) {
  // Reject probe/GET without secret — cleanup is POST-only.
  return POST(request);
}
