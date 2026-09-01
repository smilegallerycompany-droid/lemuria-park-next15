import { loginStaff } from "@/server/auth/login";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { cashierLoginSchema } from "@/lib/validation/cashier";
import {
  clientIpFromRequest,
  consumeRateLimit,
  isRateLimited,
} from "@/server/security/rate-limit";
import { DomainError } from "@/server/domain/errors";

const LOGIN_WINDOW = { limit: 10, windowMs: 15 * 60 * 1000 };

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON в теле запроса", 400);
    });
    const input = cashierLoginSchema.parse(json);
    const ip = clientIpFromRequest(req);
    const rateKey = `cashier-login:${ip}:${input.email}`;

    const gate = isRateLimited(rateKey, LOGIN_WINDOW);
    if (!gate.allowed) {
      throw new DomainError("RATE_LIMITED", "Слишком много попыток входа. Попробуйте позже.");
    }

    try {
      const user = await loginStaff({
        email: input.email,
        password: input.password,
        allowedRoles: ["CASHIER", "DIRECTOR", "ADMIN", "OWNER"],
        ip,
        ua: req.headers.get("user-agent"),
      });
      return apiSuccess({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    } catch (error) {
      if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
        consumeRateLimit(rateKey, LOGIN_WINDOW);
      }
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
