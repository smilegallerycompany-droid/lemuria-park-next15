import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainError } from "@/server/domain/errors";
import {
  assertTicketsRefundable,
  refundAmountForTickets,
  shouldRefundLocally,
} from "@/server/services/refunds";

describe("refund rules", () => {
  it("sums integer kopecks", () => {
    assert.equal(
      refundAmountForTickets([
        { status: "VALID", unitPriceAmount: 90_000 },
        { status: "VALID", unitPriceAmount: 70_000 },
      ]),
      160_000,
    );
  });

  it("blocks a second refund of the same ticket", () => {
    assert.throws(
      () =>
        assertTicketsRefundable({
          tickets: [{ id: "t1", status: "REFUNDED" }],
          allowUsed: false,
        }),
      DomainError,
    );
  });

  it("blocks USED tickets without owner policy", () => {
    assert.throws(
      () =>
        assertTicketsRefundable({
          tickets: [{ id: "t1", status: "USED" }],
          allowUsed: false,
        }),
      DomainError,
    );
    assert.doesNotThrow(() =>
      assertTicketsRefundable({
        tickets: [{ id: "t1", status: "USED" }],
        allowUsed: true,
      }),
    );
  });

  it("never calls ЮKassa on staging or staging_test payments", () => {
    assert.equal(
      shouldRefundLocally({
        appEnv: "staging",
        paymentMethod: "CARD_ONLINE",
        paymentProvider: "yookassa",
      }),
      true,
    );
    assert.equal(
      shouldRefundLocally({
        appEnv: "production",
        paymentMethod: "CARD_ONLINE",
        paymentProvider: "staging_test",
      }),
      true,
    );
    assert.equal(
      shouldRefundLocally({
        appEnv: "production",
        paymentMethod: "CASH",
        paymentProvider: null,
      }),
      true,
    );
    assert.equal(
      shouldRefundLocally({
        appEnv: "production",
        paymentMethod: "CARD_ONLINE",
        paymentProvider: "yookassa",
      }),
      false,
    );
  });
});
