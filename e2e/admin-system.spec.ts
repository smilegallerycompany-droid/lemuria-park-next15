import { test, expect } from "@playwright/test";
import { directorLogin, expectOk } from "./helpers";

test.describe("Admin system", () => {
  test("system health has statuses and never leaks secrets", async ({ page }) => {
    const request = page.request;
    await directorLogin(request);
    const res = await request.get("/api/admin/system");
    const data = await expectOk<{
      components: Array<{
        key: string;
        status: string;
        lastErrorMessage: string | null;
        detail?: string | null;
      }>;
    }>(res);

    expect(data.components.length).toBeGreaterThanOrEqual(5);
    const keys = data.components.map((c) => c.key);
    expect(keys).toContain("database");
    expect(keys).toContain("payment");
    expect(keys).toContain("maps");

    const blob = JSON.stringify(data);
    expect(blob).not.toMatch(/YUKASSA_SECRET|password|Bearer\s+[A-Za-z0-9._-]+/i);
    expect(blob).not.toMatch(/sk_live|sk_test/);

    for (const c of data.components) {
      expect(["OK", "WARNING", "ERROR", "NOT_CONFIGURED", "UNKNOWN"]).toContain(c.status);
    }

    await page.goto("/admin/system");
    await expect(page.getByRole("heading", { name: "Система" })).toBeVisible();
  });
});
