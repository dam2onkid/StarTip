import { test, expect, type Page } from "@playwright/test";
import { expectNoNav } from "./nav-helpers";

/**
 * Overlay E2E seam for `/overlay/[handle]` (PRD issue 09).
 *
 * `/overlay/[handle]` is a public OBS browser source. The server component
 * resolves the handle to the Creator's `creator_profile_id` (registered + not
 * paused) and fetches the token allowlist. The client component subscribes to
 * Supabase Realtime on
 * `donations` (filtered by `creator_profile_id`, `status IN
 * ('confirmed','indexed')`, `moderation_status = 'visible'`) and renders each
 * new donation as an animated alert: Donor Name, amount + token symbol, and
 * message.
 *
 * The mock Supabase server (`tests/fixtures/mock-supabase.mjs`) serves the
 * stub registered Creator `ada` ("Ada Lovelace"). The overlay intentionally
 * does not replay historical donations on page load, so refresh starts from a
 * blank browser source and only Realtime rows render.
 *
 * Realtime is driven through the `window.__STARTIP_OVERLAY_REALTIME_STUB__`
 * test seam so the E2E can push a new donation without a WebSocket. This
 * mirrors the creator-tab Realtime stub pattern.
 */

async function installRealtimeStub(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __STARTIP_OVERLAY_REALTIME_STUB__?: unknown }).__STARTIP_OVERLAY_REALTIME_STUB__ = {
      subscribe: (
        onInsert: (row: {
          id: string;
          donor_name: string;
          amount: string;
          token: string;
          message: string | null;
          created_at: string;
        }) => void,
      ) => {
        (window as unknown as {
          __pushOverlayDonation?: typeof onInsert;
        }).__pushOverlayDonation = onInsert;
        return () => undefined;
      },
    };
  });
}

test.describe("Overlay realtime donation alerts", () => {
  test.beforeEach(async ({ page }) => {
    await installRealtimeStub(page);
  });

  test("does not replay historical donations on load", async ({ page }) => {
    await page.goto("/overlay/ada");

    const alerts = page.getByTestId("overlay-alerts");
    await expect(alerts).toBeVisible();
    await expect(page.getByTestId("overlay-alert")).toHaveCount(0);
  });

  test("hidden donations do not appear on the overlay", async ({ page }) => {
    await page.goto("/overlay/ada");

    // The hidden donation's donor name and message never render.
    await expect(page.getByText("Troll")).toHaveCount(0);
    await expect(page.getByText("hidden bad words")).toHaveCount(0);
  });

  test("a donation inserted via Realtime appears without a page reload", async ({ page }) => {
    await page.goto("/overlay/ada");

    // Historical donations are not replayed; the not-yet-pushed donor is absent.
    await expect(page.getByTestId("overlay-alert")).toHaveCount(0);
    await expect(page.getByText("Latecomer")).toHaveCount(0);

    // Push a new visible donation through the Realtime stub.
    await page.evaluate(() =>
      (window as unknown as {
        __pushOverlayDonation?: (row: {
          id: string;
          donor_name: string;
          amount: string;
          token: string;
          message: string | null;
          created_at: string;
        }) => void;
      }).__pushOverlayDonation?.({
        id: "00000000-0000-0000-0000-0000000000d9",
        donor_name: "Latecomer",
        amount: "42",
        token: "USDC",
        message: "Caught the stream late!",
        created_at: "2026-06-06T00:00:00Z",
      }),
    );

    // The new alert renders without a reload, with name, amount + symbol,
    // and message.
    const lateAlert = page
      .getByTestId("overlay-alert")
      .filter({ hasText: "Latecomer" })
      .filter({ hasText: "Caught the stream late!" });
    await expect(lateAlert).toBeVisible();
    await expect(lateAlert.getByTestId("alert-amount")).toContainText("42");
    await expect(lateAlert.getByTestId("alert-symbol")).toContainText("USDC");
  });

  test("404s for an unknown / not-registered / paused handle", async ({ page }) => {
    const res = await page.goto("/overlay/does-not-exist");
    expect(res?.status()).toBe(404);
  });

  test("renders no nav so the browser-source surface stays transparent and chrome-free", async ({ page }) => {
    await page.goto("/overlay/ada");
    await expectNoNav(page);
  });
});
