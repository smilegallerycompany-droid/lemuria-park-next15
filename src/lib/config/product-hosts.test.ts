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

test("productSurfaceFromHostname accepts IDN and Punycode cashier hosts", () => {
  assert.equal(productSurfaceFromHostname("cashier.парклемурия.рф"), "cashier");
  assert.equal(productSurfaceFromHostname("cashier.xn--80akjgfhqje3a8k.xn--p1ai"), "cashier");
  assert.equal(productSurfaceFromHostname("admin.xn--80akjgfhqje3a8k.xn--p1ai"), "director");
  assert.equal(productSurfaceFromHostname("xn--80akjgfhqje3a8k.xn--p1ai"), null);
  assert.equal(productSurfaceFromHostname("stage.xn--80akjgfhqje3a8k.xn--p1ai"), null);
});

test("rewritePathForProductHost only rewrites the root path for cashier/director", () => {
  assert.equal(rewritePathForProductHost("/", "cashier"), "/cashier");
  assert.equal(rewritePathForProductHost("/cashier/scan", "cashier"), null);
  assert.equal(rewritePathForProductHost("/", null), null);
});

test("owner host is not published as /admin", () => {
  assert.equal(rewritePathForProductHost("/", "owner"), "/owner-unavailable");
  assert.equal(rewritePathForProductHost("/admin", "owner"), "/owner-unavailable");
  assert.equal(rewritePathForProductHost("/owner-unavailable", "owner"), null);
});
