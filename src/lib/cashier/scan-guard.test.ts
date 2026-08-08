import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldAcceptScan } from "@/lib/cashier/scan-guard";

describe("shouldAcceptScan", () => {
  it("rejects empty and duplicate within cooldown", () => {
    assert.equal(
      shouldAcceptScan({ token: "", lastToken: "", lastAtMs: 0, nowMs: 1000 }),
      false,
    );
    assert.equal(
      shouldAcceptScan({
        token: "abc",
        lastToken: "abc",
        lastAtMs: 1000,
        nowMs: 2000,
        cooldownMs: 4000,
      }),
      false,
    );
  });

  it("accepts new token or same token after cooldown", () => {
    assert.equal(
      shouldAcceptScan({
        token: "xyz",
        lastToken: "abc",
        lastAtMs: 1000,
        nowMs: 1100,
      }),
      true,
    );
    assert.equal(
      shouldAcceptScan({
        token: "abc",
        lastToken: "abc",
        lastAtMs: 1000,
        nowMs: 6000,
        cooldownMs: 4000,
      }),
      true,
    );
  });
});
