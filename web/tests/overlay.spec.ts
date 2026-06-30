import { test, expect, type Page } from "@playwright/test";

/**
 * Overlay E2E seam for `/overlay/[handle]` (PRD issue 09).
 *
 * `/overlay/[handle]` is a public OBS browser source. The server component
 * resolves the handle to the Creator's `creator_profile_id` (registered + not
 * paused) and fetches the initial visible confirmed/indexed donations + the
 * token allowlist. The client component subscribes to Supabase Realtime on
 * `donations` (filtered by `creator_profile_id`, `status IN
 * ('confirmed','indexed')`, `moderation_status = 'visible'`) and renders each
 * new donation as an animated alert: Donor Name, amount + token symbol, and
 * message.
 *
 * The mock Supabase server (`tests/fixtures/mock-supabase.mjs`) serves the
 * stub registered Creator `ada` ("Ada Lovelace") with four visible confirmed
 * donations (Ada 100 "Thank you!", Bob 500, Anonymous 9999, Fan 300 "Keep it
 * up!") and one hidden donation (Troll 1 "hidden bad words"). The overlay's
 * initial fetch filters `moderation_status = visible`, so the hidden donation
 * is suppressed by the query (mirroring the
 * `donations_anon_visible_select` RLS policy).
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

  test("renders seeded visible donations as alerts with Donor Name, amount + symbol, and message", async ({ page }) => {
    await page.goto("/overlay/ada");

    const alerts = page.getByTestId("overlay-alerts");
    await expect(alerts).toBeVisible();

    // A seeded visible donation renders with Donor Name, amount + token
    // symbol, and message.
    await expect(page.getByTestId("alert-donor-name").filter({ hasText: "Ada" })).toBeVisible();
    const adaAlert = page
      .getByTestId("overlay-alert")
      .filter({ hasText: "Ada" })
      .filter({ hasText: "Thank you!" });
    await expect(adaAlert).toBeVisible();
    await expect(adaAlert.getByTestId("alert-amount")).toContainText("100");
    await expect(adaAlert.getByTestId("alert-symbol")).toContainText("USDC");
    await expect(adaAlert.getByTestId("alert-message")).toContainText("Thank you!");
  });

  test("hidden donations do not appear on the overlay", async ({ page }) => {
    await page.goto("/overlay/ada");

    // The hidden donation's donor name and message never render.
    await expect(page.getByText("Troll")).toHaveCount(0);
    await expect(page.getByText("hidden bad words")).toHaveCount(0);
  });

  test("a donation inserted via Realtime appears without a page reload", async ({ page }) => {
    await page.goto("/overlay/ada");

    // The seeded donations are present; the not-yet-pushed donor is absent.
    await expect(page.getByTestId("alert-donor-name").filter({ hasText: "Ada" })).toBeVisible();
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
});
