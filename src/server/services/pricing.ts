import type { PriceDayType } from "@prisma/client";
import type { DbClient } from "@/lib/db/prisma";
import { isWeekendInTimezone } from "@/lib/datetime";
import { ApiError } from "@/lib/api/response";

export interface ResolvedPrice {
  ticketTypeId: string;
  ticketTypeCode: string;
  ticketTypeName: string;
  /** Kopecks. */
  unitPriceAmount: number;
  dayType: PriceDayType;
}

/**
 * Resolves the currently active price for a ticket type at a location, for
 * a given instant. The price is ALWAYS computed here, server-side — the
 * client only sends `ticketTypeCode` + `quantity`, never a price/amount.
 */
export async function resolveTicketPrice(
  db: DbClient,
  params: { locationId: string; ticketTypeId: string; timezone: string; atDate: Date },
): Promise<ResolvedPrice> {
  const { locationId, ticketTypeId, timezone, atDate } = params;
  const dayType: PriceDayType = isWeekendInTimezone(atDate, timezone) ? "WEEKEND" : "WEEKDAY";

  const ticketType = await db.ticketType.findUnique({ where: { id: ticketTypeId } });
  if (!ticketType || !ticketType.isActive) {
    throw new ApiError("INVALID_REFERENCE", "Указанный тип билета недоступен", 400);
  }

  const rule = await db.priceRule.findFirst({
    where: {
      locationId,
      ticketTypeId,
      dayType,
      isActive: true,
      validFrom: { lte: atDate },
      OR: [{ validTo: null }, { validTo: { gte: atDate } }],
    },
    orderBy: { validFrom: "desc" },
  });

  if (!rule) {
    throw new ApiError(
      "INVALID_REFERENCE",
      `Не найдена активная цена для типа билета «${ticketType.name}»`,
      400,
    );
  }

  return {
    ticketTypeId: ticketType.id,
    ticketTypeCode: ticketType.code,
    ticketTypeName: ticketType.name,
    unitPriceAmount: rule.priceAmount,
    dayType,
  };
}

/** Resolves a ticket type by its stable public `code` (e.g. "ADULT"). */
export async function findTicketTypeByCode(db: DbClient, code: string) {
  const ticketType = await db.ticketType.findUnique({ where: { code } });
  if (!ticketType || !ticketType.isActive) {
    throw new ApiError("INVALID_REFERENCE", `Неизвестный тип билета «${code}»`, 400);
  }
  return ticketType;
}
