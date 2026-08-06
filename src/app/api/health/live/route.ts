import { NextResponse } from "next/server";

/**
 * Liveness: process is up. No DB / secrets / external checks.
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, status: "live", service: "lemuria-park" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
