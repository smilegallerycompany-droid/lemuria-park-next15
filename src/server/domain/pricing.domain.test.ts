import { test } from "node:test";
import assert from "node:assert/strict";
import type { PriceRule, TicketType } from "@prisma/client";
import {
  assertTicketTypeActive,
  buildResolvedPrice,
  filterActiveRuleCandidates,
  pickActivePriceRule,
  resolveDayType,
} from "@/server/domain/pricing.domain";
import { DomainError } from "@/server/domain/errors";

function fakePriceRule(overrides: Partial<PriceRule>): PriceRule {
  return {
    id: "rule-1",
    locationId: "location-1",
    ticketTypeId: "ticket-type-1",
    dayType: "WEEKDAY",
    priceAmount: 80000,
    currency: "RUB",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validTo: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function fakeTicketType(overrides: Partial<TicketType>): TicketType {
  return {
    id: "ticket-type-1",
    code: "ADULT",
    name: "Взрослый",
    description: null,
    minAge: null,
    maxAge: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("resolveDayType uses Moscow's fixed UTC+3 offset to pick weekday vs weekend", () => {
  // Saturday 2026-07-25 00:30 UTC == 03:30 Moscow (still Saturday).
  assert.equal(resolveDayType(new Date("2026-07-25T00:30:00.000Z"), "Europe/Moscow"), "WEEKEND");
  // Monday.
  assert.equal(resolveDayType(new Date("2026-07-27T09:00:00.000Z"), "Europe/Moscow"), "WEEKDAY");
});

test("pickActivePriceRule returns null when there are no candidates", () => {
  assert.equal(pickActivePriceRule([]), null);
});

test("pickActivePriceRule picks the most recently started rule among overlapping candidates", () => {
  const older = fakePriceRule({
    id: "old",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    priceAmount: 70000,
  });
  const newer = fakePriceRule({
    id: "new",
    validFrom: new Date("2026-06-01T00:00:00.000Z"),
    priceAmount: 80000,
  });
  const picked = pickActivePriceRule([older, newer]);
  assert.equal(picked?.id, "new");
  assert.equal(picked?.priceAmount, 80000);
});

test("assertTicketTypeActive rejects a missing or inactive ticket type", () => {
  assert.throws(
    () => assertTicketTypeActive(null, "ADULT"),
    (error: unknown) => error instanceof DomainError && error.code === "TICKET_TYPE_NOT_FOUND",
  );
  assert.throws(
    () => assertTicketTypeActive(fakeTicketType({ isActive: false }), "ADULT"),
    (error: unknown) => error instanceof DomainError && error.code === "TICKET_TYPE_NOT_FOUND",
  );
});

test("buildResolvedPrice throws PRICE_NOT_CONFIGURED when no rule applies", () => {
  assert.throws(
    () => buildResolvedPrice(fakeTicketType({}), null),
    (error: unknown) => error instanceof DomainError && error.code === "PRICE_NOT_CONFIGURED",
  );
});

test("filterActiveRuleCandidates keeps only rules matching ticket type, day type and date window", () => {
  const rules = [
    fakePriceRule({ id: "weekday-adult", ticketTypeId: "ticket-type-1", dayType: "WEEKDAY" }),
    fakePriceRule({ id: "weekend-adult", ticketTypeId: "ticket-type-1", dayType: "WEEKEND" }),
    fakePriceRule({ id: "weekday-child", ticketTypeId: "ticket-type-2", dayType: "WEEKDAY" }),
    fakePriceRule({
      id: "expired-weekday-adult",
      ticketTypeId: "ticket-type-1",
      dayType: "WEEKDAY",
      validFrom: new Date("2020-01-01T00:00:00.000Z"),
      validTo: new Date("2020-12-31T00:00:00.000Z"),
    }),
  ];
  const matched = filterActiveRuleCandidates(rules, {
    ticketTypeId: "ticket-type-1",
    dayType: "WEEKDAY",
    atDate: new Date("2026-07-27T09:00:00.000Z"),
  });
  assert.deepEqual(
    matched.map((rule) => rule.id),
    ["weekday-adult"],
  );
});

test("buildResolvedPrice snapshots the ticket type + rule into a ResolvedPrice", () => {
  const price = buildResolvedPrice(fakeTicketType({}), fakePriceRule({}));
  assert.deepEqual(price, {
    ticketTypeId: "ticket-type-1",
    ticketTypeCode: "ADULT",
    ticketTypeName: "Взрослый",
    unitPriceAmount: 80000,
    dayType: "WEEKDAY",
  });
});
