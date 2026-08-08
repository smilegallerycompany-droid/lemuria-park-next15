import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors cashier QR result UX mapping without DOM. */
function scannerStatusTone(
  result:
    | "SUCCESS"
    | "ALREADY_USED"
    | "INVALID"
    | "CANCELLED"
    | "EXPIRED"
    | "WRONG_DATE"
    | "WRONG_LOCATION",
): "valid" | "used" | "bad" {
  if (result === "SUCCESS") return "valid";
  if (result === "ALREADY_USED" || result === "EXPIRED" || result === "WRONG_DATE") return "used";
  return "bad";
}

describe("scanner status states", () => {
  it("maps VALID / ALREADY_USED / WRONG_DATE / WRONG_LOCATION tones", () => {
    assert.equal(scannerStatusTone("SUCCESS"), "valid");
    assert.equal(scannerStatusTone("ALREADY_USED"), "used");
    assert.equal(scannerStatusTone("WRONG_DATE"), "used");
    assert.equal(scannerStatusTone("WRONG_LOCATION"), "bad");
    assert.equal(scannerStatusTone("CANCELLED"), "bad");
    assert.equal(scannerStatusTone("INVALID"), "bad");
  });
});
