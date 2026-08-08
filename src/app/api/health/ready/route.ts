import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/** Readiness — DB reachable. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, status: "ready", checks: { database: "ok" } },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, status: "not_ready", checks: { database: "error" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
