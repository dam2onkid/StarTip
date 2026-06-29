import { test, expect } from "@playwright/test";

/**
 * Public discovery E2E seam for `/creator/explore`, `/creator/[handle]`, and
 * `/docs` (PRD issue 06). None of these routes require auth.
 *
 * The pages read Creator and donation data from Supabase via the service role.
 * The mock Supabase server (`tests/fixtures/mock-supabase.mjs`) serves a fixed
 * registered Creator `ada` ("Ada Lovelace") and three donations: two from
 * logged-in donors (Ada 100, Bob 500) and one anonymous (9999). The
 * leaderboards exclude the anonymous donation; the Creator's total received
 * and count include it.
 *
 * Tests assert on rendered text, link targets, and navigation, not on
 * component internals.
 */

test.describe("Public discovery", () => {
  test("/creator/explore lists active creators and the global leaderboard, and links to a creator page", async ({ page }) => {
    await page.goto("/creator/explore");

    await expect(page.getByRole("heading", { name: /explore creators/i })).toBeVisible();

    // The active creator list renders the stub creator's display name + handle.
    const creatorLink = page.getByRole("link", { name: /ada lovelace/i });
    await expect(creatorLink).toBeVisible();
    await expect(creatorLink).toHaveAttribute("href", "/creator/ada");
    await expect(page.getByText(/@ada/i)).toBeVisible();

    // The global leaderboard ranks logged-in donors by total descending.
    // Bob (500) ranks above Ada (100); the anonymous 9999 donation is excluded.
    const leaderboard = page.getByTestId("global-leaderboard");
    await expect(leaderboard).toBeVisible();
    const entries = leaderboard.getByRole("listitem");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText("Bob");
    await expect(entries.nth(0)).toContainText("500");
    await expect(entries.nth(1)).toContainText("Ada");
    await expect(entries.nth(1)).toContainText("100");

    // Clicking the creator navigates to the creator page.
    await creatorLink.click();
    await expect(page).toHaveURL(/\/creator\/ada$/);
  });

  test("/creator/[handle] renders profile, stats, per-creator leaderboard, and a donate CTA", async ({ page }) => {
    await page.goto("/creator/ada");

    // Public profile.
    await expect(page.getByRole("heading", { name: /ada lovelace/i })).toBeVisible();
    await expect(page.getByText(/@ada/i)).toBeVisible();
    await expect(page.getByText(/pioneer programmer\./i)).toBeVisible();

    // Donation stats: total received = 100 + 500 + 9999 = 10599, count = 3.
    await expect(page.getByTestId("total-received")).toHaveText("10599");
    await expect(page.getByTestId("donation-count")).toHaveText("3");

    // Per-creator leaderboard: Bob (500) first, Ada (100) second; anonymous
    // excluded.
    const leaderboard = page.getByTestId("creator-leaderboard");
    await expect(leaderboard).toBeVisible();
    const entries = leaderboard.getByRole("listitem");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText("Bob");
    await expect(entries.nth(0)).toContainText("500");
    await expect(entries.nth(1)).toContainText("Ada");
    await expect(entries.nth(1)).toContainText("100");

    // Donate CTA links to the donate page.
    const donateCta = page.getByTestId("donate-cta");
    await expect(donateCta).toHaveAttribute("href", "/creator/ada/donate");
    await donateCta.click();
    await expect(page).toHaveURL(/\/creator\/ada\/donate$/);
  });

  test("/docs renders a static placeholder", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { name: /docs/i })).toBeVisible();
    await expect(page.getByTestId("docs-placeholder")).toHaveText(/documentation coming soon/i);
  });
});
