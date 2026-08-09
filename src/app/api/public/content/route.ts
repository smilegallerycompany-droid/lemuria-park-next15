import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/response";
import { getPublicCmsPayload } from "@/server/services/public-cms";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getPublicCmsPayload();
    return NextResponse.json(
      { ok: true, data },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
