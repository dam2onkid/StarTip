import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the StarTip web app.
 *
 * The E2E seam for the landing page (PRD "Testing Decisions": primary seam).
 * Tests assert on rendered text, link targets, and computed styles, not on
 * component internals, Tailwind class names, or Framer Motion variant objects.
 *
 * The webServer boots `next dev` on a fixed port and is reused across tests so
 * the suite stays fast. `next dev` is sufficient because the landing page is a
 * Server Component tree with client islands; the rendered HTML and computed
 * styles under test are identical to the production build for these assertions.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node tests/e2e-server.mjs",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
