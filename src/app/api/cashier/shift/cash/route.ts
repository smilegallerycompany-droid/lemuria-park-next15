import { z } from "zod";
import { apiSuccess, apiError, handleApiError, ApiError } from "@/lib/api/response";
import { getCashierSessionUser } from "@/server/auth/cashier-session";
import { addCashOperation } from "@/server/services/cashier-shifts";
import { clientIpFromRequest } from "@/server/security/rate-limit";

const schema = z.object({
  type: z.enum(["IN", "OUT"]),
  amount: z.number().int().positive(),
  comment: z.string().min(1).max(500),
});

export async function POST(req: Request) {
  try {
    const user = await getCashierSessionUser();
    if (!user) return apiError("UNAUTHORIZED", "Требуется вход кассира", 401);
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = schema.parse(json);

    const result = await addCashOperation({
      userId: user.id,
      type: input.type,
      amount: input.amount,
      comment: input.comment,
      ip: clientIpFromRequest(req),
      ua: req.headers.get("user-agent"),
    });

    return apiSuccess(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
