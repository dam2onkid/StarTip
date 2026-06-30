import { expect, type Page } from "@playwright/test";

/**
 * Unified nav assertions (PRD: Unified hybrid navigation, issues 01-03).
 *
 * The `SiteNav` is hoisted into the root `app/layout.tsx` so a single nav
 * renders on every route except `/overlay/*`. The root layout resolves the
 * Supabase session server-side (issue 03) and passes a `NavAuth` prop, so the
 * right cluster is auth-aware: unauthenticated visitors see the "Become a
 * Creator" CTA (links to `/signup`); authenticated users see a notification
 * bell + an avatar menu (Dashboard, Logout). The Donate Wallet connector
 * (issue 02) is always visible in both states.
 *
 * `expectUnifiedNav` asserts only the structure shared by both auth states:
 * the nav landmark, the logo, the "Discover" link, the Donate Wallet
 * connector, and the absence of the old scroll-spy anchors, so it can be
 * reused on any route regardless of auth state. The auth-aware right cluster
 * (CTA target, bell, avatar menu, Dashboard link, logout flow) is asserted in
 * the dedicated `tests/nav-auth.spec.ts`. Assertions are on rendered structure
 * and link targets, not on component internals or Tailwind classes (per the
 * PRD testing philosophy).
 */

/**
 * Asserts the unified nav is present with its finalized left cluster: the
 * StarTip logo (links to `/`) and a single "Discover" link to
 * `/creator/explore`, plus the Donate Wallet connector in its default
 * disconnected state, and that the old "How it works" / "Built on Stellar"
 * scroll-spy anchors are gone. Use on any route; pair with
 * `tests/nav-auth.spec.ts` for the auth-aware right cluster.
 */
export async function expectUnifiedNav(page: Page) {
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();

  // Left cluster: logo links home, Discover links to the explore route.
  await expect(
    nav.getByRole("link", { name: "StarTip home" }),
  ).toHaveAttribute("href", "/");
  const discover = nav.getByRole("link", { name: "Discover" });
  await expect(discover).toBeVisible();
  await expect(discover).toHaveAttribute("href", "/creator/explore");

  // Right cluster: the Donate Wallet connector (issue 02). In its default
  // (disconnected) state it renders a "Connect wallet" button. The connector
  // is always visible in both auth states and never requires login.
  await expect(
    nav.getByRole("button", { name: /connect wallet/i }),
  ).toBeVisible();

  // The old scroll-spy anchor links are no longer nav destinations.
  await expect(nav.getByRole("link", { name: "How it works" })).toHaveCount(0);
  await expect(
    nav.getByRole("link", { name: "Built on Stellar" }),
  ).toHaveCount(0);
}

/**
 * Asserts the OBS Overlay surface renders no nav at all: no navigation
 * landmark, no logo, no Discover link, no CTA, no Donate Wallet connector, no
 * notification bell, no avatar menu trigger, and no mobile menu toggle. The
 * overlay must stay transparent and chrome-free for browser-source
 * composition. Includes the issue 03 authed-right-cluster affordances (bell,
 * avatar menu trigger) so they cannot leak onto the overlay surface.
 */
export async function expectNoNav(page: Page) {
  await expect(
    page.getByRole("navigation", { name: "Primary" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "StarTip home" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Discover" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Sign in/up" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /connect wallet/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /notifications/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /account menu for/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /open menu/i })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /close menu/i }),
  ).toHaveCount(0);
}
