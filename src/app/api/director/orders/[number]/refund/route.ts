import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { requireDirector } from "@/server/auth/staff-session";
import { initiateFullRefund } from "@/server/services/refunds";
import { requestMeta } from "@/server/director/http";

const schema = z.object({
  confirm: z.literal(true),
  reason: z.string().min(3).max(500),
});

type RouteContext = { params: Promise<{ number: string }> };

/** Full refund only. Partial deferred. Cashier cannot call this route. */
export async function POST(req: Request, context: RouteContext) {
  try {
    const actor = await requireDirector();
    const { number } = await context.params;
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    schema.parse(json);
    const meta = requestMeta(req);

    const result = await initiateFullRefund({
      orderNumber: number,
      actorId: actor.id,
      reason: json.reason,
      ip: meta.ipAddress,
      ua: meta.userAgent,
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
