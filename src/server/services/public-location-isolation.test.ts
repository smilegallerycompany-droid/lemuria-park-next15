import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainError } from "@/server/domain/errors";
import { resolveBookableLocation } from "@/server/domain/public-location";

describe("public location isolation", () => {
  it("auto-selects a single active location", () => {
    const result = resolveBookableLocation({
      active: [{ slug: "sochi" }],
    });
    assert.deepEqual(result, { kind: "ok", location: { slug: "sochi" } });
  });

  it("requires an explicit slug when several locations are active", () => {
    assert.equal(
      resolveBookableLocation({
        active: [{ slug: "sochi" }, { slug: "krasnodar" }],
      }).kind,
      "need-slug",
    );
  });

  it("unknown or inactive slug is not found", () => {
    assert.equal(
      resolveBookableLocation({
        slug: "paused-city",
        active: [{ slug: "sochi" }],
      }).kind,
      "not-found",
    );
    assert.equal(
      resolveBookableLocation({
        slug: "missing",
        active: [{ slug: "sochi" }],
      }).kind,
      "not-found",
    );
  });

  it("does not mix two locations into one result", () => {
    const sochi = resolveBookableLocation({
      slug: "sochi",
      active: [{ slug: "sochi" }, { slug: "krasnodar" }],
    });
    const krasnodar = resolveBookableLocation({
      slug: "krasnodar",
      active: [{ slug: "sochi" }, { slug: "krasnodar" }],
    });
    assert.equal(sochi.kind, "ok");
    assert.equal(krasnodar.kind, "ok");
    if (sochi.kind === "ok" && krasnodar.kind === "ok") {
      assert.equal(sochi.location.slug, "sochi");
      assert.equal(krasnodar.location.slug, "krasnodar");
    }
  });
});

describe("domain error for missing location", () => {
  it("LOCATION_NOT_FOUND is a DomainError", () => {
    const error = new DomainError("LOCATION_NOT_FOUND", "Локация не найдена");
    assert.equal(error.code, "LOCATION_NOT_FOUND");
  });
});
