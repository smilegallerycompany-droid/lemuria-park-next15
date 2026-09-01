import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { analyticsQuerySchema } from "@/lib/validation/analytics";
import { requireDirector } from "@/server/auth/staff-session";
import { getDirectorAnalyticsReport } from "@/server/services/analytics-report";
import { resolveAnalyticsPeriod } from "@/server/services/analytics-period";
import { constrainLocationIds } from "@/server/auth/location-access";

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
    const scoped = constrainLocationIds(user, query.locationId);

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
      locationId: scoped === null ? query.locationId : scoped.length === 1 ? scoped[0] : undefined,
      locationIds: scoped && scoped.length !== 1 ? scoped : undefined,
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
