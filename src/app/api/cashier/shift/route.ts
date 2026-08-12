import { z } from "zod";
import { apiSuccess, apiError, handleApiError, ApiError } from "@/lib/api/response";
import { getCashierSessionUser } from "@/server/auth/cashier-session";
import {
  closeCashierShift,
  computeShiftCashSummary,
  getLastClosedShiftForCashier,
  getOpenShiftForCashier,
  openCashierShift,
  serializeOpenShiftDto,
} from "@/server/services/cashier-shifts";
import { clientIpFromRequest } from "@/server/security/rate-limit";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const user = await getCashierSessionUser();
    if (!user) return apiError("UNAUTHORIZED", "Требуется вход кассира", 401);

    const shift = await getOpenShiftForCashier(prisma, user.id);
    const lastClosed = await getLastClosedShiftForCashier(user.id);
    if (!shift) return apiSuccess({ shift: null, lastClosed });

    const summary = await computeShiftCashSummary(shift.id);
    return apiSuccess({
      shift: serializeOpenShiftDto(summary),
      lastClosed,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const openSchema = z.object({
  locationId: z.string().min(1),
  openingCashAmount: z.number().int().min(0),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const user = await getCashierSessionUser();
    if (!user) return apiError("UNAUTHORIZED", "Требуется вход кассира", 401);
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = openSchema.parse(json);

    // Ensure cashier is allowed at location (or has no bindings = all)
    if (user.locationIds.length > 0 && !user.locationIds.includes(input.locationId)) {
      throw new ApiError("FORBIDDEN", "Нет доступа к локации", 403);
    }

    const shift = await openCashierShift({
      userId: user.id,
      locationId: input.locationId,
      openingCashAmount: input.openingCashAmount,
      notes: input.notes,
      ip: clientIpFromRequest(req),
      ua: req.headers.get("user-agent"),
    });

    return apiSuccess({ shift }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

const closeSchema = z.object({
  closingCashAmount: z.number().int().min(0),
  notes: z.string().max(500).optional().nullable(),
});

export async function PATCH(req: Request) {
  try {
    const user = await getCashierSessionUser();
    if (!user) return apiError("UNAUTHORIZED", "Требуется вход кассира", 401);
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400);
    });
    const input = closeSchema.parse(json);
    const open = await getOpenShiftForCashier(prisma, user.id);
    if (!open) throw new ApiError("NOT_FOUND", "Нет открытой смены", 404);

    const result = await closeCashierShift({
      userId: user.id,
      shiftId: open.id,
      closingCashAmount: input.closingCashAmount,
      notes: input.notes,
      ip: clientIpFromRequest(req),
      ua: req.headers.get("user-agent"),
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
