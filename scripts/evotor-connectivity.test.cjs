"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { checkLabel, handle, path } = require("./evotor-connectivity.cjs");

function post(action, label = checkLabel) {
  return new Request("https://example.invalid" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + label },
    body: JSON.stringify({ action }),
  });
}

test("staging returns the APK's empty response without issuing a sale", async () => {
  const result = await handle(post("claim"), "staging");
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(await result.json(), {
    ok: true, data: { sale: null, unresolvedRequestId: null, mode: "CONNECTIVITY_ONLY" },
  });
});

test("the probe rejects results, oversized requests and use outside staging", async () => {
  assert.equal((await handle(post("claim", "wrong"), "staging")).status, 401);
  assert.equal((await handle(post("result"), "staging")).status, 409);
  assert.equal((await handle(post("x".repeat(1200)), "staging")).status, 400);
  assert.equal((await handle(post("claim"), "production")).status, 404);
  assert.equal((await handle(post("claim"), "")).status, 404);
});
