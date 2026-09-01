import assert from "node:assert/strict";
import { test } from "node:test";
import {
  productSurfaceFromHostname,
  rewritePathForProductHost,
} from "@/lib/config/product-hosts";

test("productSurfaceFromHostname maps four-host convention", () => {
  assert.equal(productSurfaceFromHostname("cashier.lemuriapark.ru"), "cashier");
  assert.equal(productSurfaceFromHostname("admin.lemuriapark.ru"), "director");
  assert.equal(productSurfaceFromHostname("owner.lemuriapark.ru"), "owner");
  assert.equal(productSurfaceFromHostname("lemuriapark.ru"), null);
  assert.equal(productSurfaceFromHostname("d5xxx.apigw.yandexcloud.net"), null);
});

test("rewritePathForProductHost only rewrites the root path", () => {
  assert.equal(rewritePathForProductHost("/", "cashier"), "/cashier");
  assert.equal(rewritePathForProductHost("/cashier/scan", "cashier"), null);
  assert.equal(rewritePathForProductHost("/", null), null);
});
