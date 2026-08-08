import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { analyticsQuerySchema } from "@/lib/validation/analytics";
import { requireDirector } from "@/server/auth/staff-session";
import { getDirectorAnalyticsReport } from "@/server/services/analytics-report";
import { resolveAnalyticsPeriod } from "@/server/services/analytics-period";

export async function GET(req: Request) {
  try {
    const user = await requireDirector();
    const url = new URL(req.url);
    const raw = Object.fromEntries(url.searchParams.entries());
    const parsed = analyticsQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Некорректные параметры аналитики", 400, {
        issues: parsed.error.flatten(),
      });
    }

    const query = parsed.data;
    if (query.locationId && user.locationIds.length > 0 && !user.locationIds.includes(query.locationId)) {
      return apiError("FORBIDDEN", "Нет доступа к выбранной локации", 403);
    }

    const { from, to, preset } = resolveAnalyticsPeriod({
      preset: query.preset,
      from: query.from,
      to: query.to,
      timeZone: query.timezone,
    });

    if (from.getTime() > to.getTime()) {
      return apiError("VALIDATION_ERROR", "Период «с» не может быть позже «по»", 400);
    }

    const maxRangeMs = 100 * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxRangeMs) {
      return apiError("VALIDATION_ERROR", "Период не может превышать 100 дней", 400);
    }

    const report = await getDirectorAnalyticsReport({
      from,
      to,
      locationId: query.locationId,
      source: query.source,
      paymentMethod: query.paymentMethod,
      ticketTypeId: query.ticketTypeId,
      cashierId: query.cashierId,
      timeZone: query.timezone,
    });

    return apiSuccess({
      ...report,
      filters: {
        locationId: query.locationId ?? null,
        source: query.source,
        paymentMethod: query.paymentMethod,
        ticketTypeId: query.ticketTypeId ?? null,
        cashierId: query.cashierId ?? null,
        timezone: query.timezone,
        preset,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
