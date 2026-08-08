/**
 * Verify staging QR fixtures A–F against real check-in API (no client mocks).
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.STAGING_BASE_URL ?? "http://127.0.0.1:3001";
const CASHIER = { email: "cashier@lemuriapark.ru", password: "ChangeMe123!" };

async function main() {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve("docs/qa-screenshots-rc2/staging-qr/fixtures.json"), "utf8"),
  );

  const login = await fetch(`${BASE}/api/cashier/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(CASHIER),
  });
  if (!login.ok) throw new Error(`login ${login.status}`);
  const cookie = login.headers.getSetCookie?.()?.join("; ") ?? login.headers.get("set-cookie") ?? "";
  if (!cookie) throw new Error("no session cookie");

  async function check(label: string, qrToken: string, expected: string | string[]) {
    const res = await fetch(`${BASE}/api/cashier/check-in`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ qrToken }),
    });
    const body = await res.json();
    const result = body?.data?.result;
    const ok = Array.isArray(expected) ? expected.includes(result) : result === expected;
    console.log(ok ? "PASS" : "FAIL", label, "→", result, body?.data?.message ?? "");
    if (!ok) process.exitCode = 1;
    return result;
  }

  const f = manifest.fixtures;
  await check("A_VALID", f.A_VALID.qrToken, "SUCCESS");
  await check("A_VALID_REPEAT→ALREADY_USED", f.A_VALID.qrToken, "ALREADY_USED");
  await check("B_USED", f.B_USED.qrToken, "ALREADY_USED");
  await check("C_WRONG_DATE", f.C_WRONG_DATE.qrToken, "WRONG_DATE");
  await check("D_WRONG_LOCATION", f.D_WRONG_LOCATION.qrToken, "WRONG_LOCATION");
  await check("E_CANCELLED", f.E_CANCELLED.qrToken, "CANCELLED");
  await check("F_REFUNDED", f.F_REFUNDED.qrToken, ["CANCELLED"]); // server maps refunded → CANCELLED
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
