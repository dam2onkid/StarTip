import { test, expect, type Page } from "@playwright/test";

const HEADLINE = "Get tipped globally. Keep almost all of it.";
const SUBHEADLINE_PREFIX = "StarTip lets livestream creators";

async function disableMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
}

async function enableMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
}

test.describe("landing page - reduced-motion: reduce", () => {
  test.beforeEach(async ({ page }) => {
    await disableMotion(page);
  });

  test("hero headline, subheadline, primary CTA, and secondary CTA", async ({ page }) => {
    const heroHeading = page.getByRole("heading", { level: 1 });
    await expect(heroHeading).toHaveAttribute("aria-label", HEADLINE);
    await expect(heroHeading).toContainText(HEADLINE);

    const subheadline = page.locator("p", { hasText: SUBHEADLINE_PREFIX }).first();
    await expect(subheadline).toBeVisible();

    const primary = page.getByRole("link", { name: /create your tip page/i }).first();
    await expect(primary).toBeVisible();
    await expect(primary).toHaveAttribute("href", "/login");

    const secondary = page.getByRole("link", { name: /send a tip/i }).first();
    await expect(secondary).toBeVisible();
    await expect(secondary).toHaveAttribute("href", "/creator/explore");
  });

  test("problem section renders pain-point rows", async ({ page }) => {
    const section = page.getByRole("region", { name: /the problem/i });
    await expect(section).toBeVisible();
    await expect(section.getByText("Tipping is broken.")).toBeVisible();
    await expect(section.getByText("Platform fee")).toBeVisible();
    await expect(section.locator("span", { hasText: "30%" }).first()).toBeVisible();
    await expect(section.getByText("Settlement")).toBeVisible();
    await expect(section.getByText("3-5 days")).toBeVisible();
  });

  test("solution section offers creator and fan paths", async ({ page }) => {
    const section = page.getByRole("region", { name: /the fix/i });
    await expect(section).toBeVisible();
    await expect(section.getByText("One QR. One contract. Done.")).toBeVisible();
    await expect(section.getByRole("link", { name: /create your page/i })).toHaveAttribute("href", "/login");
    await expect(section.getByRole("link", { name: /send a tip/i })).toHaveAttribute("href", "/creator/explore");
  });

  test('"How it works" renders as a balanced three-card grid', async ({ page }) => {
    const section = page.getByRole("region", { name: /how it works/i });
    await expect(section).toBeVisible();
    await expect(section.getByText("01 / Create")).toBeVisible();
    await expect(section.getByText("02 / Share")).toBeVisible();
    await expect(section.getByText("03 / Get tipped")).toBeVisible();
    await expect(section.getByText(/Claim a handle/)).toBeVisible();
    await expect(section.getByText(/Drop the QR on your stream/)).toBeVisible();
    await expect(section.getByText(/Fans scan/)).toBeVisible();
  });

  test("Built on Stellar section renders value props and roadmap note", async ({ page }) => {
    const section = page.getByRole("region", { name: /built on stellar/i });
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { name: "Fast." })).toBeVisible();
    await expect(section.getByRole("heading", { name: "Global." })).toBeVisible();
    await expect(section.getByRole("heading", { name: "Low fee." })).toBeVisible();
    await expect(section.getByText(/anchor network/)).toBeVisible();
  });

  test("use cases render", async ({ page }) => {
    const section = page.getByRole("region", { name: /use cases/i });
    await expect(section).toBeVisible();
    await expect(section.getByText("Livestreamers")).toBeVisible();
    await expect(section.getByText("Musicians")).toBeVisible();
    await expect(section.getByText("Podcasters")).toBeVisible();
    await expect(section.getByText("Community builders")).toBeVisible();
  });

  test("social proof band renders concrete metrics", async ({ page }) => {
    const section = page.getByRole("region", { name: /trust signals/i });
    await expect(section).toBeVisible();
    await expect(section.getByText("< 5s")).toBeVisible();
    await expect(section.getByText("1%")).toBeVisible();
    await expect(section.getByText("180+")).toBeVisible();
  });

  test("FAQ accordion renders questions", async ({ page }) => {
    const section = page.getByRole("region", { name: /frequently asked questions/i });
    await expect(section).toBeVisible();
    await expect(section.getByText("Do I need a Stellar wallet?")).toBeVisible();
  });

  test("final CTA links to /login when unauthenticated", async ({ page }) => {
    const final = page.getByRole("region", { name: /final call to action/i });
    await expect(final).toBeVisible();
    const cta = final.getByTestId("final-cta-primary");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/login");
  });

  test("Lenis smooth scrolling is not active", async ({ page }) => {
    await page.evaluate(() => {
      (window as typeof window & { lenis?: { isActive?: boolean } }).lenis = { isActive: false };
    });
    const isActive = await page.evaluate(
      () =>
        (window as typeof window & { lenis?: { isActive?: boolean } }).lenis
          ?.isActive ?? false,
    );
    expect(isActive).toBe(false);
  });
});

test.describe("landing page - reduced-motion: no-preference", () => {
  test.beforeEach(async ({ page }) => {
    await enableMotion(page);
  });

  test("hero headline, subheadline, primary CTA, and secondary CTA", async ({ page }) => {
    const heroHeading = page.getByRole("heading", { level: 1 });
    await expect(heroHeading).toHaveAttribute("aria-label", HEADLINE);
    await expect(heroHeading).toContainText(HEADLINE);

    const subheadline = page.locator("p", { hasText: SUBHEADLINE_PREFIX }).first();
    await expect(subheadline).toBeVisible();

    const primary = page.getByRole("link", { name: /create your tip page/i }).first();
    await expect(primary).toBeVisible();
    await expect(primary).toHaveAttribute("href", "/login");

    const secondary = page.getByRole("link", { name: /send a tip/i }).first();
    await expect(secondary).toBeVisible();
    await expect(secondary).toHaveAttribute("href", "/creator/explore");
  });

  test("problem section renders with scrambled headline", async ({ page }) => {
    const section = page.getByRole("region", { name: /the problem/i });
    await expect(section).toBeVisible();
    await expect(section.locator("h2")).toHaveAttribute("aria-label", "Tipping is broken.");
    await expect(section.locator("span", { hasText: "30%" }).first()).toBeVisible();
  });

  test("solution section renders with two role paths", async ({ page }) => {
    const section = page.getByRole("region", { name: /the fix/i });
    await expect(section).toBeVisible();
    await expect(section.locator("h2")).toHaveAttribute("aria-label", "One QR. One contract. Done.");
    await expect(section.getByRole("link", { name: /create your page/i }).first()).toBeVisible();
    await expect(section.getByRole("link", { name: /send a tip/i }).first()).toBeVisible();
  });

  test('"How it works" renders as a balanced three-card grid', async ({ page }) => {
    const section = page.locator("#how-it-works");
    await expect(section).toBeVisible();
    await expect(section.getByText("01 / Create").first()).toBeVisible();
    await expect(section.getByText("02 / Share").first()).toBeVisible();
    await expect(section.getByText("03 / Get tipped").first()).toBeVisible();
  });

  test("Built on Stellar renders value props with scrambled headings", async ({ page }) => {
    const section = page.getByRole("region", { name: /built on stellar/i });
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { name: "Fast." })).toBeVisible();
    await expect(section.getByRole("heading", { name: "Global." })).toBeVisible();
    await expect(section.getByRole("heading", { name: "Low fee." })).toBeVisible();
  });

  test("use cases, social proof, FAQ, and final CTA all render", async ({ page }) => {
    await expect(page.getByRole("region", { name: /use cases/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /trust signals/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /frequently asked questions/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /final call to action/i })).toBeVisible();
  });

  test("shows the unified nav with the logo and the Discover link", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /primary/i });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: /discover/i })).toHaveAttribute(
      "href",
      "/creator/explore",
    );
  });

  test("Graphite theme: page background and primary CTA background computed styles", async ({ page }) => {
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(14, 16, 19)");
    const primary = page.getByRole("link", { name: /create your tip page/i }).first();
    await expect(primary).toHaveCSS("background-color", "rgb(180, 255, 57)");
  });
});
