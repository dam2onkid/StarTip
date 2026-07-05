import { test, expect } from "@playwright/test";
import { expectUnifiedNav } from "./nav-helpers";

/**
 * Landing page E2E seam.
 *
 * The single behavioral test for the landing page per the PRD "Testing
 * Decisions": content, structure, navigation, theme, and motion accessibility.
 * Asserts on rendered text, link targets, and computed styles, not on
 * component internals, Tailwind class names, or Framer Motion variant objects.
 *
 * Two passes:
 * - `prefers-reduced-motion: no-preference` (the default): verifies content,
 *   structure, link targets, and the Graphite theme at the computed-style level.
 * - `prefers-reduced-motion: reduce`: verifies the How it works steps render
 *   statically (no `whileInView` gating) and Lenis smooth scrolling is not
 *   active.
 */

const HEADLINE = "Fast, global tips for livestream creators. Settled on Stellar.";
const SUBHEADLINE_PREFIX = "Fans scan a QR and send a Stellar asset.";

test.describe("landing page — prefers-reduced-motion: no-preference", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
  });

  test("hero headline, subheadline, and single primary CTA", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADLINE);

    const subheadline = page.locator("p", { hasText: SUBHEADLINE_PREFIX }).first();
    await expect(subheadline).toBeVisible();
    await expect(subheadline).toContainText(SUBHEADLINE_PREFIX);

    // The primary CTA lives in the main content (the hero). The nav and footer
    // also expose "Sign in/up" links, but those are ghost / text links,
    // not the single Tertiary primary CTA (PRD single-accent rule). Scoping to
    // `main` targets the hero CTA without asserting on internals.
    const primaryCta = page
      .getByRole("main")
      .getByRole("link", { name: "Sign in/up" });
    await expect(primaryCta).toHaveAttribute("href", "/login");
    // Exactly one primary CTA with this label in the main content.
    await expect(primaryCta).toHaveCount(1);
  });

  test("three secondary cards render headers, body copy, and CTA links", async ({ page }) => {
    const nextSteps = page.getByRole("region", { name: "Next steps" });
    await expect(nextSteps).toBeVisible();

    // Card headers are asserted as rendered text rather than heading role, so
    // the test does not depend on whether a card title renders as an h3 or a
    // styled div (PRD: assert on rendered text, not component internals).
    await expect(nextSteps.getByText("Already a Creator?")).toBeVisible();
    await expect(nextSteps.getByText("Here to tip?")).toBeVisible();
    await expect(nextSteps.getByText("How it works")).toBeVisible();

    await expect(
      nextSteps.getByText(
        "View your donations, moderate messages, and configure your overlay.",
      ),
    ).toBeVisible();
    await expect(
      nextSteps.getByText(
        "Scan a QR from the stream, or look up a Creator by handle.",
      ),
    ).toBeVisible();

    await expect(
      nextSteps.getByRole("link", { name: "Open Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    await expect(
      nextSteps.getByRole("link", { name: "Find a Creator" }),
    ).toHaveAttribute("href", "/s");
    await expect(
      nextSteps.getByRole("link", { name: "See the flow" }),
    ).toHaveAttribute("href", "#how-it-works");
  });

  test('"How it works" section renders three steps with labels and body copy', async ({ page }) => {
    const section = page.locator("#how-it-works");
    await expect(section).toBeVisible();

    await expect(section.getByText("01 / Register")).toBeVisible();
    await expect(section.getByText("02 / Share")).toBeVisible();
    await expect(section.getByText("03 / Receive")).toBeVisible();

    await expect(
      section.getByText(
        "Create a profile, link your Stellar wallet, and register on-chain. The contract binds your handle to your payout address.",
      ),
    ).toBeVisible();
    await expect(
      section.getByText(
        "Get a donate link and QR. Drop the QR on your stream. Add the overlay URL to OBS.",
      ),
    ).toBeVisible();
    await expect(
      section.getByText(
        "Fans donate. The contract settles in seconds, the overlay alerts, your dashboard tracks every tip with on-chain proof.",
      ),
    ).toBeVisible();
  });

  test('"Built on Stellar" section renders value props and roadmap note', async ({ page }) => {
    const section = page.getByRole("region", { name: "Built on Stellar" });
    await expect(section).toBeVisible();

    await expect(section.getByRole("heading", { name: "Fast." })).toBeVisible();
    await expect(section.getByRole("heading", { name: "Global." })).toBeVisible();
    await expect(section.getByRole("heading", { name: "Low fee." })).toBeVisible();

    await expect(
      section.getByText(
        "Transactions settle in seconds on a ledger built for payments. No waiting on block confirmations, no stuck transfers.",
      ),
    ).toBeVisible();
    await expect(
      section.getByText(
        "Any wallet, any country. A donor in Tokyo and a creator in Hanoi settle on the same ledger in the same block.",
      ),
    ).toBeVisible();
    await expect(
      section.getByText(
        "A fraction of a cent per transaction. The platform takes a bounded fee, on-chain and capped. The rest reaches the creator.",
      ),
    ).toBeVisible();

    // Roadmap note frames cross-border cash-out as a future capability.
    await expect(
      section.getByText(/cross-border cash-out/),
    ).toBeVisible();
    await expect(
      section.getByText(/fiat off-ramp integration is on the roadmap/),
    ).toBeVisible();
  });

  test("Graphite theme: page background and primary CTA background computed styles", async ({ page }) => {
    // Page background uses the Neutral color (#0E1013 -> rgb(14, 16, 19)).
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(14, 16, 19)",
    );

    // Primary CTA background uses the Tertiary color (#B4FF39 -> rgb(180, 255, 57)).
    const primaryCta = page
      .getByRole("main")
      .getByRole("link", { name: "Sign in/up" });
    await expect(primaryCta).toHaveCSS(
      "background-color",
      "rgb(180, 255, 57)",
    );
  });

  test("shows the unified nav with the logo and the Discover link", async ({ page }) => {
    // The nav is hoisted into the root layout, so the landing page inherits it.
    // The hero "Sign in/up" CTA lives in main; the nav CTA is a separate
    // ghost link in the Primary navigation landmark.
    await expectUnifiedNav(page);
  });
});

test.describe("landing page — prefers-reduced-motion: reduce", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
  });

  test('"How it works" steps render statically and are visible without scrolling', async ({ page }) => {
    const section = page.locator("#how-it-works");

    // The three step labels are present in the DOM. Under reduced motion the
    // static render path is used (no `whileInView` opacity gating), so the
    // steps are visible immediately without being scrolled into view.
    const register = section.getByText("01 / Register");
    const share = section.getByText("02 / Share");
    const receive = section.getByText("03 / Receive");

    await expect(register).toBeVisible();
    await expect(share).toBeVisible();
    await expect(receive).toBeVisible();

    // No scrolling: the steps' computed opacity is full (not the `whileInView`
    // hidden state of opacity 0 awaiting viewport entry).
    for (const step of [register, share, receive]) {
      const opacity = await step.evaluate((el) =>
        window.getComputedStyle(el).opacity,
      );
      expect(opacity).toBe("1");
    }
  });

  test("Lenis smooth scrolling is not active", async ({ page }) => {
    // Lenis adds the `lenis` class to the document root element when active.
    // Under reduced motion, LenisProvider does not mount LenisScroll, so the
    // class must be absent and native scrolling is unintercepted.
    const hasLenisClass = await page.evaluate(() =>
      document.documentElement.classList.contains("lenis"),
    );
    expect(hasLenisClass).toBe(false);

    // Native scroll works: programmatic scrollTo moves the scroll position.
    await page.evaluate(() => window.scrollTo(0, 100));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThanOrEqual(90);
  });
});
