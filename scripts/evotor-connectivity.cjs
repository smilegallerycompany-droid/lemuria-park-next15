"use strict";

// Public label for a connectivity-only response. This route has no access to
// jobs, terminal credentials, customer data, fiscal receipts or payments.
const checkLabel = "lemuria-evotor-staging-connectivity";
const path = "/api/integrations/evotor/checkout";
const maxRequestBytes = 1024;

function response(status, fields) {
  return Response.json(fields, { status, headers: { "Cache-Control": "no-store" } });
}

function fail(status, code) {
  return response(status, { ok: false, error: { code } });
}

async function readAction(request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) return null;
  const text = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (bytes <= maxRequestBytes) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(body + text.decode())?.action ?? null;
      bytes += value.byteLength;
      if (bytes <= maxRequestBytes) body += text.decode(value, { stream: true });
    }
    await reader.cancel();
    return null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function handle(request, environment = process.env.APP_ENV) {
  if (environment !== "staging") return fail(404, "NOT_FOUND");
  if (request.method === "GET") {
    return response(200, { ok: true, data: { mode: "CONNECTIVITY_ONLY" } });
  }
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
  if (request.headers.get("authorization") !== "Bearer " + checkLabel) {
    return fail(401, "UNAUTHORIZED");
  }
  const action = await readAction(request);
  if (action === "result") return fail(409, "CONNECTIVITY_ONLY");
  if (action !== "claim") return fail(400, "INVALID_REQUEST");
  return response(200, {
    ok: true,
    data: { sale: null, unresolvedRequestId: null, mode: "CONNECTIVITY_ONLY" },
  });
}

module.exports = { checkLabel, handle, path };
