import { test, expect, type Page } from "@playwright/test";
import { expectUnifiedNav } from "./nav-helpers";

/**
 * Nav auth-aware right cluster E2E (PRD: Unified hybrid navigation, issue 03).
 *
 * The root layout resolves the Supabase session server-side and passes a
 * `NavAuth` prop to `SiteNav`, so the right cluster is auth-aware. Coverage:
 *
 *   - Unauthenticated: the "Become a Creator" CTA links to `/signup` (alongside
 *     the Donate Wallet connector); no bell or avatar menu.
 *   - Authenticated: the CTA is replaced by a notification bell + an avatar
 *     menu (no CTA).
 *   - The bell opens an empty-state dropdown ("No notifications yet").
 *   - The avatar menu opens a header with the caller's email and a "Dashboard"
 *     link to `/dashboard`.
 *   - "Logout" clears the session and navigates to `/login`.
 *
 * Supabase Auth is stubbed via the mock HTTP server (tests/fixtures/mock-supabase.mjs)
 * the app talks to during E2E. The stub user's email is "fan@example.com" and
 * the profile starts with display_name "Fan" / null avatar (initials
 * fallback). The mock server's `profile` row is a single mutable in-memory
 * object shared across all parallel workers, so other E2E files (donor-tab,
 * creator-tab) can mutate `display_name` ("Super Fan", "Ada") while this spec
 * runs. This spec therefore matches the avatar trigger by the stable
 * `/account menu for/i` label (not a hard-coded name) and asserts only the
 * immutable email in the menu header.
 */

const STUB_EMAIL = "fan@example.com";

async function establishSession(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(STUB_EMAIL);
  await page.getByLabel(/password/i).fill("secret123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Nav auth-aware right cluster", () => {
  test.describe("unauthenticated", () => {
    test("the Become a Creator CTA links to /signup alongside the wallet connector", async ({ page }) => {
      await page.goto("/");
      await expectUnifiedNav(page);
      const nav = page.getByRole("navigation", { name: "Primary" });
      await expect(
        nav.getByRole("link", { name: "Become a Creator" }),
      ).toHaveAttribute("href", "/signup");
    });

    test("no notification bell or avatar menu is present on a public page", async ({ page }) => {
      await page.goto("/creator/explore");
      const nav = page.getByRole("navigation", { name: "Primary" });
      await expect(nav.getByRole("button", { name: /notifications/i })).toHaveCount(0);
      await expect(
        nav.getByRole("button", { name: /account menu for/i }),
      ).toHaveCount(0);
    });

    test("clicking the CTA navigates to /signup", async ({ page }) => {
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "Primary" });
      await nav.getByRole("link", { name: "Become a Creator" }).click();
      await expect(page).toHaveURL(/\/signup$/);
    });
  });

  test.describe("authenticated", () => {
    test.beforeEach(async ({ page }) => {
      await establishSession(page);
    });

    test("replaces the CTA with a notification bell and an avatar menu trigger", async ({ page }) => {
      const nav = page.getByRole("navigation", { name: "Primary" });
      // Authed right cluster: bell + avatar menu trigger, no CTA.
      await expect(nav.getByRole("button", { name: /notifications/i })).toBeVisible();
      await expect(
        nav.getByRole("button", { name: /account menu for/i }),
      ).toBeVisible();
      await expect(
        nav.getByRole("link", { name: "Become a Creator" }),
      ).toHaveCount(0);
    });

    test("the notification bell opens an empty-state dropdown", async ({ page }) => {
      const nav = page.getByRole("navigation", { name: "Primary" });
      await nav.getByRole("button", { name: /notifications/i }).click();
      await expect(page.getByText(/no notifications yet/i)).toBeVisible();
    });

    test("the avatar menu shows the caller's email and a Dashboard link to /dashboard", async ({ page }) => {
      const nav = page.getByRole("navigation", { name: "Primary" });
      // The trigger is labelled "account menu for <display_name>". The
      // display_name is mutable on the shared mock server (other specs can
      // PATCH it in parallel), so match by the stable prefix only.
      await nav.getByRole("button", { name: /account menu for/i }).click();

      const dashboard = page.getByRole("menuitem", { name: /dashboard/i });
      await expect(dashboard).toBeVisible();
      await expect(dashboard).toHaveAttribute("href", "/dashboard");
      // The header shows the immutable stub email. The display_name is also
      // present but is not asserted (see the file doc comment).
      await expect(page.getByText(STUB_EMAIL)).toBeVisible();
    });

    test("the avatar menu Logout item clears the session and navigates to /login", async ({ page }) => {
      const nav = page.getByRole("navigation", { name: "Primary" });
      await nav.getByRole("button", { name: /account menu for/i }).click();
      await page.getByRole("menuitem", { name: /log out/i }).click();
      await expect(page).toHaveURL(/\/login$/);

      // The session is cleared: navigating back to /dashboard redirects to
      // /login instead of rendering the authed shell.
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
