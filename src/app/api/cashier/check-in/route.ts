import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { getCashierSessionUser } from "@/server/auth/cashier-session";
import { checkInTicket } from "@/server/services/check-in";

const bodySchema = z.object({
  qrToken: z.string().trim().min(4).max(512),
});

export async function POST(req: Request) {
  try {
    const user = await getCashierSessionUser();
    if (!user) throw new ApiError("NOT_FOUND", "Требуется вход кассира", 401);
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = bodySchema.parse(json);
    const result = await checkInTicket({
      qrToken: input.qrToken,
      cashierId: user.id,
    });
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
