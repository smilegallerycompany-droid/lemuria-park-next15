import assert from "node:assert/strict";
import { test } from "node:test";
import { apiGet, apiPost, ApiClientError } from "./client";
import { directorFetch, DirectorApiError } from "../director/client";

test("API clients validate HTTP status, JSON envelopes and gateway errors", async (t) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  for (const body of [null, [], {}, { ok: true }, { ok: false }, { ok: false, error: {} }]) {
    t.mock.method(globalThis, "fetch", async () => json(body));
    await assert.rejects(
      apiGet("/api/test"),
      (e: unknown) => e instanceof ApiClientError && e.code === "INVALID_RESPONSE",
    );
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, "fetch", async () => json({ ok: true, data: { saved: true } }, 500));
  await assert.rejects(
    apiPost("/api/test", {}),
    (e: unknown) => e instanceof ApiClientError && e.status === 500,
  );
  t.mock.restoreAll();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("<html>Bad Gateway</html>", { status: 502 });
  });
  await assert.rejects(
    directorFetch("/api/director/test", { method: "POST", body: "{}" }),
    (e: unknown) =>
      e instanceof DirectorApiError &&
      e.code === "INVALID_RESPONSE" &&
      !e.message.includes("Unexpected token"),
  );
  assert.equal(calls, 1, "Never duplicate state-changing requests after a gateway error");
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () =>
    json({ ok: false, error: { code: "FORBIDDEN", message: "Нет доступа" } }, 403),
  );
  await assert.rejects(
    directorFetch("/api/director/test"),
    (e: unknown) =>
      e instanceof DirectorApiError && e.code === "FORBIDDEN" && e.message === "Нет доступа",
  );
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => json({ ok: true, data: { count: 21 } }));
  assert.deepEqual(await apiGet("/api/test"), { count: 21 });
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async (_path: unknown, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("X-Request-Test"), "preserved");
    assert.equal(init?.credentials, "include");
    return json({ ok: true, data: {} });
  });
  await directorFetch("/api/director/test", {
    headers: new Headers({ "X-Request-Test": "preserved" }),
  });
});
