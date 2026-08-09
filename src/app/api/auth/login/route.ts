import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { loginStaff } from "@/server/auth/login";
import {
  clientIpFromRequest,
  consumeRateLimit,
  isRateLimited,
} from "@/server/security/rate-limit";
import { DomainError } from "@/server/domain/errors";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  portal: z.enum(["cashier", "director", "admin"]).default("cashier"),
});

const LOGIN_WINDOW = { limit: 10, windowMs: 15 * 60 * 1000 };

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON в теле запроса", 400);
    });
    const input = schema.parse(json);
    const ip = clientIpFromRequest(req);
    const ua = req.headers.get("user-agent");
    const rateKey = `login:${ip}:${input.email.toLowerCase()}`;

    // Count only failed attempts — successful E2E/staff logins must not lock the suite.
    const gate = isRateLimited(rateKey, LOGIN_WINDOW);
    if (!gate.allowed) {
      throw new DomainError("RATE_LIMITED", "Слишком много попыток входа. Попробуйте позже.");
    }

    const allowedRoles =
      input.portal === "admin"
        ? (["ADMIN", "OWNER"] as const)
        : input.portal === "director"
          ? (["DIRECTOR", "ADMIN", "OWNER"] as const)
          : (["CASHIER", "DIRECTOR", "ADMIN", "OWNER"] as const);

    try {
      const user = await loginStaff({
        email: input.email,
        password: input.password,
        allowedRoles: [...allowedRoles],
        ip,
        ua,
      });

      return apiSuccess({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        locationIds: user.locationIds,
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
