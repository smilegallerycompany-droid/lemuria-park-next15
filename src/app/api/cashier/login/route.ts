import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { apiSuccess, apiError, handleApiError, ApiError } from "@/lib/api/response";
import { cashierLoginSchema } from "@/lib/validation/cashier";
import { createCashierSessionCookie } from "@/server/auth/cashier-session";
import { clientIpFromRequest, consumeRateLimit } from "@/server/security/rate-limit";
import { DomainError } from "@/server/domain/errors";

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON в теле запроса", 400);
    });
    const input = cashierLoginSchema.parse(json);
    const ip = clientIpFromRequest(req);

    const limit = consumeRateLimit(`cashier-login:${ip}:${input.email}`, {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!limit.allowed) {
      throw new DomainError("RATE_LIMITED", "Слишком много попыток входа. Попробуйте позже.");
    }

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.status !== "ACTIVE") {
      return apiError("NOT_FOUND", "Неверный email или пароль", 401);
    }
    if (user.role !== "CASHIER" && user.role !== "ADMIN" && user.role !== "OWNER") {
      return apiError("NOT_FOUND", "Неверный email или пароль", 401);
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
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
