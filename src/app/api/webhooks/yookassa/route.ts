import { NextResponse } from "next/server";
import { applyYooKassaWebhook } from "@/server/services/payments";
import { handleApiError } from "@/lib/api/response";

/**
 * YooKassa notification endpoint.
 * Marks orders PAID only after a real provider SUCCEEDED event — never locally.
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const result = await applyYooKassaWebhook(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
