import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hostnameFromHostHeader,
  isHostAllowed,
  parseAllowedHosts,
  shouldSkipHostAllowlist,
} from "@/lib/config/allowed-hosts";

test("parseAllowedHosts splits, trims, and lowercases", () => {
  assert.deepEqual(parseAllowedHosts("LemuriaPark.ru, cashier.lemuriapark.ru "), [
    "lemuriapark.ru",
    "cashier.lemuriapark.ru",
  ]);
  assert.deepEqual(parseAllowedHosts(""), []);
  assert.deepEqual(parseAllowedHosts(null), []);
});

test("hostnameFromHostHeader strips ports and keeps IPv6", () => {
  assert.equal(hostnameFromHostHeader("lemuriapark.ru:443"), "lemuriapark.ru");
  assert.equal(hostnameFromHostHeader("LEMURIAPARK.RU"), "lemuriapark.ru");
  assert.equal(hostnameFromHostHeader("[::1]:3000"), "::1");
  assert.equal(hostnameFromHostHeader(""), null);
});

test("isHostAllowed is open when the list is empty (local/dev)", () => {
  assert.equal(isHostAllowed("anything.example", []), true);
});

test("isHostAllowed matches exact hosts and wildcard suffixes", () => {
  const allowed = parseAllowedHosts("lemuriapark.ru,*.apigw.yandexcloud.net");
  assert.equal(isHostAllowed("lemuriapark.ru", allowed), true);
  assert.equal(isHostAllowed("cashier.lemuriapark.ru", allowed), false);
  assert.equal(isHostAllowed("d5xxx.apigw.yandexcloud.net", allowed), true);
  assert.equal(isHostAllowed("evil.com", allowed), false);
});

test("health probes skip the host allowlist", () => {
  assert.equal(shouldSkipHostAllowlist("/api/health/live"), true);
  assert.equal(shouldSkipHostAllowlist("/api/health/ready"), true);
  assert.equal(shouldSkipHostAllowlist("/"), false);
});
