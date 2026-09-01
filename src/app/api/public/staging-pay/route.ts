import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { applyStagingTestPayment } from "@/server/services/payments";
import { clientIpFromRequest, consumeRateLimit } from "@/server/security/rate-limit";
import { DomainError } from "@/server/domain/errors";

const bodySchema = z.object({
  orderNumber: z.string().trim().min(4).max(64),
});

/**
 * Staging-only test payment. Production runtime and production DB refuse this.
 * Does not call ЮKassa and does not invent success outside `lemuria_staging`.
 */
export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req);
    const gate = consumeRateLimit(`staging-pay:${ip}`, { limit: 20, windowMs: 60_000 });
    if (!gate.allowed) {
      throw new DomainError("RATE_LIMITED", "Слишком много попыток. Подождите немного.");
    }

    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = bodySchema.parse(json);
    const result = await applyStagingTestPayment(input.orderNumber);
    return apiSuccess({ ...result, label: "STAGING / TEST" });
  } catch (error) {
    return handleApiError(error);
  }
}
