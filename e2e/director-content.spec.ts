import { test, expect } from "@playwright/test";
import { CASHIER, directorLogin, expectOk } from "./helpers";

test.describe("Director content CMS", () => {
  test("cashier denied content API", async ({ request }) => {
    await request.post("/api/cashier/login", { data: CASHIER });
    const res = await request.get("/api/director/content");
    expect([401, 403]).toContain(res.status());
  });

  test("director updates hero and public reflects", async ({ page }) => {
    const request = page.request;
    await directorLogin(request);
    const marker = `E2E Hero ${Date.now()}`;

    try {
      const patch = await request.patch("/api/director/content", {
        data: {
          site: {
            heroBadge: "E2E",
            heroTitle: marker,
            heroSubtitle: "Зоотеатр",
            heroDescription: "CMS e2e description",
            heroCtaLabel: "Купить билет",
            heroCtaHref: "#booking",
            heroActive: true,
          },
        },
      });
      await expectOk(patch);

      const publicRes = await request.get("/api/public/content");
      const cms = await expectOk<{ hero: { title: string } }>(publicRes);
      expect(cms.hero.title).toBe(marker);

      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Hero");
    } finally {
      await request.patch("/api/director/content", {
        data: {
          site: {
            heroBadge: "Онлайн-касса",
            heroTitle: "Лемурия\nПарк",
            heroSubtitle: "Зоотеатр лемуров",
            heroDescription:
              "Семейный зоотеатр с яркими впечатлениями и добрыми эмоциями — билеты на удобное время онлайн.",
            heroCtaLabel: "Купить билет",
            heroCtaHref: "#booking",
            heroActive: true,
          },
        },
      });
    }
  });

  test("FAQ create → public sees; archive → public hides", async ({ request }) => {
    await directorLogin(request);
    const q = `E2E FAQ ${Date.now()}?`;

    const listed = await expectOk<{ faq: Array<{ id: string; isPublished: boolean }> }>(
      await request.get("/api/director/content/faq"),
    );
    const parked = listed.faq.filter((f) => f.isPublished).at(-1);
    if (listed.faq.filter((f) => f.isPublished).length >= 5 && parked) {
      await expectOk(
        await request.patch(`/api/director/content/faq/${parked.id}`, {
          data: { archive: true },
        }),
      );
    }

    try {
      const created = await request.post("/api/director/content/faq", {
        data: { question: q, answer: "Answer from e2e", sortOrder: 0, isPublished: true },
      });
      const { item } = await expectOk<{ item: { id: string } }>(created);

      const pub1 = await expectOk<{ faq: Array<{ question: string }> }>(
        await request.get("/api/public/content"),
      );
      expect(pub1.faq.some((f) => f.question === q)).toBe(true);
      expect(pub1.faq.length).toBeLessThanOrEqual(5);

      await expectOk(
        await request.patch(`/api/director/content/faq/${item.id}`, {
          data: { archive: true },
        }),
      );

      const pub2 = await expectOk<{ faq: Array<{ question: string }> }>(
        await request.get("/api/public/content"),
      );
      expect(pub2.faq.some((f) => f.question === q)).toBe(false);
    } finally {
      if (parked) {
        await request.patch(`/api/director/content/faq/${parked.id}`, {
          data: { restore: true },
        });
      }
    }
  });

  test("gallery metadata create shows on public", async ({ request }) => {
    await directorLogin(request);
    const alt = `e2e-gallery-${Date.now()}`;
    const created = await request.post("/api/director/content/gallery", {
      data: {
        imageUrl: "https://example.com/e2e-gallery.png",
        altText: alt,
        caption: "caption",
        sortOrder: 0,
        isPublished: true,
      },
    });
    const { item } = await expectOk<{ item: { id: string } }>(created);

    const pub = await expectOk<{ gallery: Array<{ altText: string }> }>(
      await request.get("/api/public/content"),
    );
    expect(pub.gallery.some((g) => g.altText === alt)).toBe(true);

    await expectOk(
      await request.patch(`/api/director/content/gallery/${item.id}`, {
        data: { archive: true },
      }),
    );
  });
});
