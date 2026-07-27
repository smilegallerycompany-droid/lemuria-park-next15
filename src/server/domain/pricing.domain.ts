import type { PriceDayType, PriceRule, TicketType } from "@prisma/client";
import { isWeekendInTimezone } from "@/lib/datetime";
import { DomainError } from "@/server/domain/errors";

export interface ResolvedPrice {
  ticketTypeId: string;
  ticketTypeCode: string;
  ticketTypeName: string;
  /** Kopecks. */
  unitPriceAmount: number;
  dayType: PriceDayType;
}

/**
 * PricingDomain — pure business rules for resolving the price of a ticket
 * type at a given instant. Never touches the database: the repository
 * layer fetches candidate rules, this layer decides which one applies.
 */

export function resolveDayType(atDate: Date, timezone: string): PriceDayType {
  return isWeekendInTimezone(atDate, timezone) ? "WEEKEND" : "WEEKDAY";
}

/**
 * Picks the single applicable price rule out of the candidates already
 * fetched by the repository (filtered to the correct location/ticket
 * type/day type/active/date-range window). If several qualify, the most
 * recently started one wins.
 */
export function pickActivePriceRule(candidates: PriceRule[]): PriceRule | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, rule) =>
    rule.validFrom.getTime() > latest.validFrom.getTime() ? rule : latest,
  );
}

/**
 * In-memory equivalent of the repository's `findActiveCandidates` filter.
 * Lets a caller fetch the *entire* (small) active rule set for a
 * location+ticket-types once, then filter/pick per session in JS —
 * avoiding one DB round trip per session when listing many sessions.
 */
export function filterActiveRuleCandidates(
  rules: PriceRule[],
  params: { ticketTypeId: string; dayType: PriceDayType; atDate: Date },
): PriceRule[] {
  return rules.filter(
    (rule) =>
      rule.ticketTypeId === params.ticketTypeId &&
      rule.dayType === params.dayType &&
      rule.isActive &&
      rule.validFrom.getTime() <= params.atDate.getTime() &&
      (rule.validTo === null || rule.validTo.getTime() >= params.atDate.getTime()),
  );
}

export function assertTicketTypeActive(
  ticketType: TicketType | null,
  code: string,
): asserts ticketType is TicketType {
  if (!ticketType || !ticketType.isActive) {
    throw new DomainError("TICKET_TYPE_NOT_FOUND", `Неизвестный тип билета «${code}»`, { code });
  }
}

export function buildResolvedPrice(ticketType: TicketType, rule: PriceRule | null): ResolvedPrice {
  if (!rule) {
    throw new DomainError(
      "PRICE_NOT_CONFIGURED",
      `Не найдена активная цена для типа билета «${ticketType.name}»`,
      { ticketTypeCode: ticketType.code },
    );
  }
  return {
    ticketTypeId: ticketType.id,
    ticketTypeCode: ticketType.code,
    ticketTypeName: ticketType.name,
    unitPriceAmount: rule.priceAmount,
    dayType: rule.dayType,
  };
}
