import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { loginStaff } from "@/server/auth/login";
import { clientIpFromRequest, consumeRateLimit } from "@/server/security/rate-limit";
import { DomainError } from "@/server/domain/errors";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  portal: z.enum(["cashier", "director"]).default("cashier"),
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON в теле запроса", 400);
    });
    const input = schema.parse(json);
    const ip = clientIpFromRequest(req);
    const ua = req.headers.get("user-agent");

    const limit = consumeRateLimit(`login:${ip}:${input.email.toLowerCase()}`, {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!limit.allowed) {
      throw new DomainError("RATE_LIMITED", "Слишком много попыток входа. Попробуйте позже.");
    }

    const allowedRoles =
      input.portal === "director"
        ? (["ADMIN", "OWNER"] as const)
        : (["CASHIER", "ADMIN", "OWNER"] as const);

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
    return handleApiError(error);
  }
}
