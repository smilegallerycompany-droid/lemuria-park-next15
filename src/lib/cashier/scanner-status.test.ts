import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scannerStatusTitle, scannerStatusTone } from "@/lib/cashier/scanner-status";

describe("scanner status states", () => {
  it("maps SUCCESS / ALREADY_USED / WRONG_DATE / WRONG_LOCATION / REFUNDED tones", () => {
    assert.equal(scannerStatusTone("SUCCESS"), "valid");
    assert.equal(scannerStatusTone("ALREADY_USED"), "used");
    assert.equal(scannerStatusTone("WRONG_DATE"), "used");
    assert.equal(scannerStatusTone("WRONG_LOCATION"), "bad");
    assert.equal(scannerStatusTone("CANCELLED"), "bad");
    assert.equal(scannerStatusTone("INVALID"), "bad");
    assert.equal(scannerStatusTone("REFUNDED"), "refunded");
  });

  it("uses distinct Russian titles for each result", () => {
    const titles = [
      "SUCCESS",
      "ALREADY_USED",
      "REFUNDED",
      "CANCELLED",
      "EXPIRED",
      "WRONG_LOCATION",
      "INVALID",
    ].map((code) => scannerStatusTitle(code as Parameters<typeof scannerStatusTitle>[0]));
    assert.equal(new Set(titles).size, titles.length);
  });
});
