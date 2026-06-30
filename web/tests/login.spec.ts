import { test, expect, type Page } from "@playwright/test";
import { expectUnifiedNav } from "./nav-helpers";

/**
 * Email + password login -> dashboard -> logout E2E.
 *
 * Supabase Auth is stubbed via a mock HTTP server (tests/fixtures/mock-supabase.mjs)
 * that the app talks to during E2E. The flow:
 *   1. /login renders an email input, a password input, and a "Sign in" action.
 *   2. Submitting credentials calls signInWithPassword (stubbed to return a
 *      session) and the router navigates to /dashboard.
 *   3. /dashboard renders the authed shell with Donor + Creator tabs, a
 *      "Become a Creator" affordance, and a logout action.
 *   4. Clicking logout ends the session and returns to /login.
 *
 * The /signup page is also covered: submitting credentials calls signUp
 * (stubbed to auto-confirm + return a session) and navigates to /dashboard.
 */

// Drive the real login submit so the session cookie is seeded, then expect the
// redirect to /dashboard. After this, the page is authed.
async function establishSession(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("fan@example.com");
  await page.getByLabel(/password/i).fill("secret123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("email + password login flow", () => {
  test("/login renders an email input, a password input, and a Sign in action", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in/i }),
    ).toBeVisible();
  });

  test("submitting credentials signs in and redirects to /dashboard", async ({ page }) => {
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

  test("shows the unified nav with the Discover link on /login and /dashboard", async ({ page }) => {
    // Unauthenticated: /login inherits the nav from the root layout. The
    // auth-aware right cluster (CTA -> /login) is asserted in
    // tests/nav-auth.spec.ts; here we only assert the shared structure.
    await page.goto("/login");
    await expectUnifiedNav(page);

    // Authenticated: /dashboard inherits the same nav. The auth-aware right
    // cluster (bell + avatar menu) is asserted in tests/nav-auth.spec.ts; here
    // we only assert the shared structure. The dashboard's own "Become a
    // Creator" affordance lives in the Creator tab (a button), so it does not
    // collide with the nav.
    await establishSession(page);
    await expectUnifiedNav(page);
  });
});

test.describe("/signup page", () => {
  test("/signup renders email, password, confirm password, and a Sign up action", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign up/i }),
    ).toBeVisible();
  });

  test("submitting signup credentials navigates to /dashboard (mock auto-confirms)", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/email/i).fill("newfan@example.com");
    await page.getByLabel(/^password$/i).fill("secret123");
    await page.getByLabel(/confirm password/i).fill("secret123");
    await page.getByRole("button", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("renders a link back to /login", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("link", { name: /log in/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  test("shows the unified nav with the Discover link on /signup", async ({ page }) => {
    await page.goto("/signup");
    await expectUnifiedNav(page);
  });
});
