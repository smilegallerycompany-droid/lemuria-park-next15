import { test, expect } from "@playwright/test";
import { expectOk } from "./helpers";

test.describe("Public CMS binding", () => {
  test("public content API returns hero/about/faq with fallbacks", async ({ request, page }) => {
    const res = await request.get("/api/public/content");
    const data = await expectOk<{
      hero: { title: string; ctaLabel: string } | null;
      about: { title: string; benefits: unknown[] };
      faq: Array<{ question: string }>;
      locations: { locations: unknown[] };
    }>(res);

    expect(data.about.title).toBeTruthy();
    expect(Array.isArray(data.about.benefits)).toBe(true);
    expect(data.faq.length).toBeGreaterThan(0);

    await page.goto("/");
    await expect(page.locator("#faq")).toBeVisible();
    await expect(page.locator("#about")).toBeVisible();
  });
});
