import { z } from "zod";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { requireCashier } from "@/server/auth/cashier-session";
import { SARATOV_BREAK_TIMES } from "@/server/domain/saratov-breaks";
import { setCashierBreak } from "@/server/services/cashier-breaks";

const inputSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.enum(SARATOV_BREAK_TIMES),
    cancelled: z.boolean(),
  })
  .strict();

export async function PATCH(req: Request) {
  try {
    const user = await requireCashier();
    const input = inputSchema.parse(await req.json().catch(() => null));
    return apiSuccess(await setCashierBreak(user, input));
  } catch (error) {
    return handleApiError(error);
  }
}
