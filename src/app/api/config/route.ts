import { NextResponse } from "next/server";
import { PRICES, SITE } from "@/lib/domain";
export async function GET() {
  return NextResponse.json({ site: SITE, prices: PRICES });
}
