import type { PriceDayType } from "@prisma/client";
import type { DbClient } from "@/lib/db/prisma";

/** Repository — raw Prisma data access for `PriceRule`. No business logic. */
export const priceRuleRepository = {
  /**
   * Returns every rule that could apply (location + ticket type + day type +
   * active + validity window). `PricingDomain.pickActivePriceRule` decides
   * which single candidate actually wins.
   */
  findActiveCandidates(
    db: DbClient,
    params: { locationId: string; ticketTypeId: string; dayType: PriceDayType; atDate: Date },
  ) {
    return db.priceRule.findMany({
      where: {
        locationId: params.locationId,
        ticketTypeId: params.ticketTypeId,
        dayType: params.dayType,
        isActive: true,
        validFrom: { lte: params.atDate },
        OR: [{ validTo: null }, { validTo: { gte: params.atDate } }],
      },
    });
  },
};
