import { test, expect, type Page } from "@playwright/test";

/**
 * Donor tab E2E for `/dashboard`. The stubbed Supabase Auth + seeded donations
 * (tests/fixtures/mock-supabase.mjs) give the logged-in stub user ("Fan",
 * user_id ...001) one confirmed donation of 300 USDC to creator `ada`, with
 * the message "Keep it up!". Two other logged-in donors (Bob 500, Ada 100) and
 * one anonymous donation (9999, excluded from leaderboards) are also seeded.
 *
 * Assertions cover:
 *   * donation history render (amount, token, message),
 *   * Global Leaderboard rank (Fan is #2: Bob 500 > Fan 300 > Ada 100),
 *   * per-creator rank for `ada` (Fan is #2),
 *   * display name edit via the owner UPDATE RLS path,
 *   * avatar upload to the `avatars` bucket producing a public URL on the
 *     Profile (avatar preview `<img>` appears with the storage public URL).
 */

async function establishSession(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("fan@example.com");
  await page.getByRole("button", { name: /send magic link/i }).click();
  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  await page.goto("/auth/callback?code=stub-code");
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Donor tab", () => {
  test.beforeEach(async ({ page }) => {
    await establishSession(page);
  });

  test("renders the donation history with amount, token, and message", async ({ page }) => {
    const history = page.getByTestId("donor-history");
    await expect(history).toBeVisible();
    await expect(history).toContainText("300");
    await expect(history).toContainText("USDC");
    await expect(history).toContainText("Keep it up!");
  });

  test("renders the global leaderboard rank (#2 with 300 donated)", async ({ page }) => {
    const rank = page.getByTestId("global-rank");
    await expect(rank).toBeVisible();
    await expect(rank).toContainText("#2");
    await expect(rank).toContainText("300");
  });

  test("renders the per-creator rank for each creator the user donated to", async ({ page }) => {
    const ranks = page.getByTestId("per-creator-ranks");
    await expect(ranks).toBeVisible();
    await expect(ranks).toContainText("Ada Lovelace");
    await expect(ranks).toContainText("@ada");
    // Fan is #2 for creator `ada` (Bob 500 > Fan 300).
    await expect(ranks).toContainText("#2");
  });

  test("edits the display name via the owner UPDATE RLS path", async ({ page }) => {
    const input = page.getByLabel(/display name/i);
    await expect(input).toHaveValue("Fan");
    await input.fill("Super Fan");
    await page.getByRole("button", { name: /save profile/i }).click();
    await expect(page.getByTestId("save-status")).toHaveText(/saved/i);
  });

  test("uploads an avatar and stores the public URL on the profile", async ({ page }) => {
    // Before upload, the avatar placeholder is shown (no img preview).
    await expect(page.getByTestId("avatar-placeholder")).toBeVisible();

    // Upload a PNG via the file input.
    await page.getByTestId("avatar-input").setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      buffer: Buffer.from("89504E470D0A1A0A", "hex"),
    });

    await page.getByRole("button", { name: /save profile/i }).click();
    await expect(page.getByTestId("save-status")).toHaveText(/saved/i);

    // After upload, the avatar preview <img> appears with the storage public URL.
    const preview = page.getByTestId("avatar-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute(
      "src",
      /\/storage\/v1\/object\/public\/avatars\//,
    );
  });
});
