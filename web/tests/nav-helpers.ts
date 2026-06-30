import { expect, type Page } from "@playwright/test";

/**
 * Unified nav assertions (PRD: Unified hybrid navigation, issue 01).
 *
 * The `SiteNav` is hoisted into the root `app/layout.tsx` so a single nav
 * renders on every route except `/overlay/*`. These helpers assert the public
 * structure of that nav so each page's E2E seam can confirm nav presence and
 * the "Discover" link target without duplicating the assertions. They assert
 * on rendered structure and link targets, not on component internals or
 * Tailwind classes (per the PRD testing philosophy).
 */

/**
 * Asserts the unified nav is present with its finalized left cluster: the
 * StarTip logo (links to `/`) and a single "Discover" link to
 * `/creator/explore`, plus the retained "Become a Creator" CTA, and that the
 * old "How it works" / "Built on Stellar" scroll-spy anchors are gone.
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

  // Right cluster: the Become a Creator CTA remains (reworked in slice 3).
  await expect(
    nav.getByRole("link", { name: "Become a Creator" }),
  ).toHaveAttribute("href", "/login");

  // The old scroll-spy anchor links are no longer nav destinations.
  await expect(nav.getByRole("link", { name: "How it works" })).toHaveCount(0);
  await expect(
    nav.getByRole("link", { name: "Built on Stellar" }),
  ).toHaveCount(0);
}

/**
 * Asserts the OBS Overlay surface renders no nav at all: no navigation
 * landmark, no logo, no Discover link, no CTA, and no mobile menu toggle. The
 * overlay must stay transparent and chrome-free for browser-source composition.
 */
export async function expectNoNav(page: Page) {
  await expect(
    page.getByRole("navigation", { name: "Primary" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "StarTip home" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Discover" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Become a Creator" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /open menu/i })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /close menu/i }),
  ).toHaveCount(0);
}
