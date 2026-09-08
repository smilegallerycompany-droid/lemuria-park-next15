import assert from "node:assert/strict";
import { test } from "node:test";
import { asciiOriginFromUrl, displayOriginFromUrl } from "@/lib/config/public-origin";
import { wwwApexHostname } from "@/lib/config/product-hosts";

test("display origin uses Unicode for .рф", () => {
  assert.equal(displayOriginFromUrl("https://xn--80akjgfhqje3a8k.xn--p1ai"), "https://парклемурия.рф");
  assert.equal(displayOriginFromUrl("https://парклемурия.рф"), "https://парклемурия.рф");
});

test("ascii origin uses Punycode", () => {
  assert.equal(
    asciiOriginFromUrl("https://парклемурия.рф"),
    "https://xn--80akjgfhqje3a8k.xn--p1ai",
  );
});

test("www apex strips the www label after IDN normalize", () => {
  assert.equal(wwwApexHostname("www.парклемурия.рф"), "xn--80akjgfhqje3a8k.xn--p1ai");
  assert.equal(wwwApexHostname("cashier.парклемурия.рф"), null);
});
