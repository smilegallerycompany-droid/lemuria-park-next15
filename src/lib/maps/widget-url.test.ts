import assert from "node:assert/strict";
import { test } from "node:test";
import { trustedYandexMapWidgetUrl } from "@/lib/maps/widget-url";

test("accepts official Yandex map widget URLs", () => {
  assert.equal(
    trustedYandexMapWidgetUrl("https://yandex.ru/map-widget/v1/?um=constructor%3Aabc"),
    "https://yandex.ru/map-widget/v1/?um=constructor%3Aabc",
  );
  assert.equal(
    trustedYandexMapWidgetUrl("https://api-maps.yandex.ru/frame/v1/-/CVh7YBYg"),
    "https://api-maps.yandex.ru/frame/v1/-/CVh7YBYg",
  );
});

test("rejects non-widget, non-HTTPS, and untrusted URLs", () => {
  for (const value of [
    "",
    "https://yandex.ru/maps/?text=Краснодар",
    "https://yandex.ru.evil.test/map-widget/v1/",
    "http://yandex.ru/map-widget/v1/",
    "javascript:alert(1)",
    "https://api-maps.yandex.ru.evil.test/frame/v1/abc",
    "https://foo:bar@yandex.ru/map-widget/v1/",
  ]) {
    assert.equal(trustedYandexMapWidgetUrl(value), null);
  }
});
