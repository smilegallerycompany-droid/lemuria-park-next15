import { NextResponse } from "next/server";

/** Liveness — process is up. No dependency checks. */
export async function GET() {
  return NextResponse.json(
    { ok: true, status: "live", sha: process.env.GIT_SHA ?? null },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
