import { test, expect, type Page } from "@playwright/test";

/**
 * Login -> dashboard -> logout E2E.
 *
 * Supabase Auth is stubbed via a mock HTTP server (tests/fixtures/mock-supabase.mjs)
 * that the app talks to during E2E. The flow:
 *   1. /login renders an email input and a "Send magic link" action.
 *   2. Submitting the email calls signInWithOtp (stubbed to succeed) and shows
 *      a confirmation. signInWithOtp also seeds the PKCE code_verifier cookie.
 *   3. Visiting /auth/callback?code=stub exchanges the code (stubbed) and
 *      redirects to /dashboard.
 *   4. /dashboard renders the authed shell with Donor + Creator tabs, a
 *      "Become a Creator" affordance, and a logout action.
 *   5. Clicking logout ends the session and returns to /login.
 */

// Drive the real login submit so the PKCE code_verifier cookie is seeded, then
// complete the magic link callback. After this, the page is authed.
async function establishSession(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("fan@example.com");
  await page.getByRole("button", { name: /send magic link/i }).click();
  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  await page.goto("/auth/callback?code=stub-code");
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("magic link login flow", () => {
  test("/login renders an email input and a Send magic link action", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send magic link/i }),
    ).toBeVisible();
  });

  test("submitting the email sends the magic link and shows a confirmation", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("fan@example.com");
    await page.getByRole("button", { name: /send magic link/i }).click();
    await expect(page.getByText(/check your inbox/i)).toBeVisible();
  });

  test("/auth/callback exchanges the code and redirects to /dashboard", async ({ page }) => {
    await establishSession(page);
  });

  test("/dashboard renders the authed shell with tabs, Become a Creator, and logout", async ({ page }) => {
    await establishSession(page);

    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /donor/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /creator/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /become a creator/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /log out/i }),
    ).toBeVisible();
  });

  test("unauthenticated /dashboard redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("logout ends the session and returns to /login", async ({ page }) => {
    await establishSession(page);
    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
