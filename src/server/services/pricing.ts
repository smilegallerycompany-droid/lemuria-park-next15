import type { DbClient } from "@/lib/db/prisma";
import {
  assertTicketTypeActive,
  buildResolvedPrice,
  pickActivePriceRule,
  resolveDayType,
  type ResolvedPrice,
} from "@/server/domain/pricing.domain";
import { ticketTypeRepository } from "@/server/repositories/ticket-type.repository";
import { priceRuleRepository } from "@/server/repositories/price-rule.repository";

export type { ResolvedPrice };

/**
 * PricingService — orchestrates Repository (fetch candidates) + Domain
 * (pick the applicable rule, compute day type). Price is always resolved
 * here, server-side — callers never trust a price sent by the client.
 */
export async function resolveTicketPrice(
  db: DbClient,
  params: { locationId: string; ticketTypeId: string; timezone: string; atDate: Date },
): Promise<ResolvedPrice> {
  const { locationId, ticketTypeId, timezone, atDate } = params;
  const dayType = resolveDayType(atDate, timezone);

  const ticketType = await ticketTypeRepository.findById(db, ticketTypeId);
  assertTicketTypeActive(ticketType, ticketTypeId);

  const candidates = await priceRuleRepository.findActiveCandidates(db, {
    locationId,
    ticketTypeId,
    dayType,
    atDate,
  });
  const rule = pickActivePriceRule(candidates);

  return buildResolvedPrice(ticketType, rule);
}

/** Resolves a ticket type by its stable public `code` (e.g. "ADULT"). */
export async function findTicketTypeByCode(db: DbClient, code: string) {
  const ticketType = await ticketTypeRepository.findByCode(db, code);
  assertTicketTypeActive(ticketType, code);
  return ticketType;
}
