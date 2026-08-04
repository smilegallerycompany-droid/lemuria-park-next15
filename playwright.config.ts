import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a production-like Next server on :3001.
 * Prefers an already-running server (reuseExistingServer) so local iteration is fast.
 * Requires `npm run build` before first `next start` if no server is up.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next start -p 3001",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
