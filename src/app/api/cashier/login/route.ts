import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { apiSuccess, apiError, handleApiError, ApiError } from "@/lib/api/response";
import { cashierLoginSchema } from "@/lib/validation/cashier";
import { createCashierSessionCookie } from "@/server/auth/cashier-session";
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

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (
      !user ||
      user.status !== "ACTIVE" ||
      (user.role !== "CASHIER" &&
        user.role !== "DIRECTOR" &&
        user.role !== "ADMIN" &&
        user.role !== "OWNER")
    ) {
      consumeRateLimit(rateKey, LOGIN_WINDOW);
      return apiError("NOT_FOUND", "Неверный email или пароль", 401);
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      consumeRateLimit(rateKey, LOGIN_WINDOW);
      return apiError("NOT_FOUND", "Неверный email или пароль", 401);
    }

    await createCashierSessionCookie(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return apiSuccess({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
