import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { requireCashier } from "@/server/auth/cashier-session";
import { checkInLocationScope } from "@/server/auth/location-access";
import { checkInTicket } from "@/server/services/check-in";
import { clientIpFromRequest, consumeRateLimit } from "@/server/security/rate-limit";
import { DomainError } from "@/server/domain/errors";
import { getErrorReporter } from "@/server/monitoring/error-reporter";

const bodySchema = z.object({
  qrToken: z.string().trim().min(4).max(512),
});

export async function POST(req: Request) {
  try {
    const user = await requireCashier();

    const ip = clientIpFromRequest(req);
    const limit = consumeRateLimit(`check-in:${ip}:${user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.allowed) {
      throw new DomainError("RATE_LIMITED", "Слишком много сканирований. Подождите немного.");
    }

    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = bodySchema.parse(json);
    try {
      const result = await checkInTicket({
        qrToken: input.qrToken,
        cashierId: user.id,
        allowedLocationIds: checkInLocationScope(user),
      });
      return apiSuccess(result);
    } catch (error) {
      getErrorReporter().captureException(error, {
        event: "CHECK_IN_INTERNAL_ERROR",
        tags: { cashierId: user.id },
      });
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
