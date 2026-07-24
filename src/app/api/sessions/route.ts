import { NextResponse } from "next/server";
import { SITE } from "@/lib/domain";
export async function GET() {
  const times = Array.from({ length: 21 }, (_, i) => {
    const mins = 630 + i * 30;
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  });
  return NextResponse.json({
    capacity: SITE.capacity,
    sessions: times.map((time, i) => ({
      time,
      sold: (i * 7) % 14,
      remaining: SITE.capacity - ((i * 7) % 14),
    })),
  });
}
