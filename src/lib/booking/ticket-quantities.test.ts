import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSubmitTicketSelection,
  emptyTicketQuantities,
  lineTotalKopecks,
  selectedTicketCount,
  setTicketQuantity,
} from "./ticket-quantities";

describe("ticket quantities (arbitrary codes)", () => {
  it("starts every published type at 0, including codes without ADULT/CHILD", () => {
    const qty = emptyTicketQuantities(["VIP_EVENING", "GROUP_PASS", "STAGING_ADULT"]);
    assert.deepEqual(qty, { VIP_EVENING: 0, GROUP_PASS: 0, STAGING_ADULT: 0 });
    assert.equal(selectedTicketCount(qty), 0);
    assert.equal(canSubmitTicketSelection(qty, 8), false);
  });

  it("plus/minus never go negative and share remaining seats across types", () => {
    let qty = emptyTicketQuantities(["VIP_EVENING", "GROUP_PASS"]);
    qty = setTicketQuantity({ quantities: qty, code: "VIP_EVENING", next: 5, remainingSeats: 4 });
    assert.equal(qty.VIP_EVENING, 4);
    qty = setTicketQuantity({ quantities: qty, code: "GROUP_PASS", next: 3, remainingSeats: 4 });
    assert.equal(qty.GROUP_PASS, 0);
    qty = setTicketQuantity({ quantities: qty, code: "VIP_EVENING", next: 2, remainingSeats: 4 });
    qty = setTicketQuantity({ quantities: qty, code: "GROUP_PASS", next: 3, remainingSeats: 4 });
    assert.equal(qty.VIP_EVENING, 2);
    assert.equal(qty.GROUP_PASS, 2);
    qty = setTicketQuantity({ quantities: qty, code: "GROUP_PASS", next: -9, remainingSeats: 4 });
    assert.equal(qty.GROUP_PASS, 0);
    assert.equal(canSubmitTicketSelection(qty, 4), true);
  });

  it("recomputes the kopeck total for mixed types", () => {
    const qty = { VIP_EVENING: 2, GROUP_PASS: 1 };
    assert.equal(
      lineTotalKopecks(qty, [
        { code: "VIP_EVENING", unitPrice: 150_000 },
        { code: "GROUP_PASS", unitPrice: 90_000 },
      ]),
      390_000,
    );
  });
});
