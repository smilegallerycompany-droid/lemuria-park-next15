import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import {
  extractCronSecret,
  isGatewayProxied,
  isYandexTimerCleanupEvent,
  secretsEqual,
} from "@/lib/config/cron-auth";
import { handleApiError } from "@/lib/api/response";
import { runScheduledCleanup } from "@/server/services/scheduled-cleanup";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

async function handle(request: Request) {
  try {
    const expected = env.CRON_SECRET;
    if (!expected) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_CONFIGURED", message: "Cron is not configured" } },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const provided = extractCronSecret(request.headers);
    const viaSecret = Boolean(provided && secretsEqual(provided, expected));
    let viaTimer = false;
    if (!viaSecret && request.method === "POST" && !isGatewayProxied(request.headers)) {
      const body = await request.json().catch(() => null);
      viaTimer = isYandexTimerCleanupEvent(body);
    }
    if (!viaSecret && !viaTimer) {
      return unauthorized();
    }

    const data = await runScheduledCleanup();
    return NextResponse.json(
      { ok: true, data },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/** Timer triggers may use GET or POST; both require the cron secret. */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
