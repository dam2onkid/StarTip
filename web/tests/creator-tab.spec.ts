import { test, expect, type Page } from "@playwright/test";

/**
 * Creator tab active-features E2E.
 *
 * The stub user is logged in and the mock Supabase is toggled into
 * "creator-mode" (POST /mock/creator-mode), which makes the stub user a
 * registered on-chain Creator with a handle, owner address, payout address,
 * and a set of received donations (including a hidden one). The dashboard
 * server component then loads the active-features panel.
 *
 * On-chain actions (update_creator_payout, set_creator_active_owner) are
 * driven through the `window.__STARTIP_CREATOR_UPDATE_STUB__` test seam so
 * the E2E does not have to mock the full Soroban JSON-RPC surface. The
 * Realtime flip for payout_address / paused is driven through
 * `window.__STARTIP_REALTIME_STUB__`.
 */

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

async function establishSession(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("fan@example.com");
  await page.getByRole("button", { name: /send magic link/i }).click();
  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  await page.goto("/auth/callback?code=stub-code");
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function installSeams(page: Page) {
  await page.addInitScript(() => {
    // Creator update seam: stands in for the client-side
    // update_creator_payout / set_creator_active_owner build/sign/submit path.
    (window as unknown as { __STARTIP_CREATOR_UPDATE_STUB__?: unknown }).__STARTIP_CREATOR_UPDATE_STUB__ = {
      updateCreatorPayout: async () => ({ status: "PENDING", hash: "stub-payout-tx" }),
      setCreatorActive: async () => ({ status: "PENDING", hash: "stub-pause-tx" }),
    };
    // Treasury seam for the payout warning.
    (window as unknown as { __STARTIP_TREASURY_STUB__?: unknown }).__STARTIP_TREASURY_STUB__ =
      async () => null;
    // Realtime seam: capture the callback so the test can push
    // payout_address / paused flips.
    (window as unknown as { __STARTIP_REALTIME_STUB__?: unknown }).__STARTIP_REALTIME_STUB__ = {
      subscribe: (onUpdate: (next: { payout_address?: string; paused?: boolean }) => void) => {
        (window as unknown as { __pushCreatorUpdate?: (next: { payout_address?: string; paused?: boolean }) => void }).__pushCreatorUpdate = onUpdate;
        return () => undefined;
      },
    };
  });
}

async function enableCreatorMode(page: Page, supabasePort: number) {
  await page.request.post(`http://127.0.0.1:${supabasePort}/mock/creator-mode`, {
    data: { enabled: true },
  });
}

test.describe("Creator tab active features", () => {
  test.beforeEach(async ({ page }) => {
    await installSeams(page);
    // The E2E server starts the mock Supabase on a fixed port (see
    // e2e-server.mjs). Toggle creator-mode before logging in so the dashboard
    // server component loads the active panel on first render.
    const supabasePort = Number(process.env.MOCK_SUPABASE_PORT ?? "5499");
    await enableCreatorMode(page, supabasePort);
    await establishSession(page);
    // Re-enable creator-mode and reload, in case a parallel test file reset
    // it between the initial toggle and the dashboard render. The reload
    // ensures the server component re-reads the profile with creator-mode on.
    await enableCreatorMode(page, supabasePort);
    await page.reload();
    await expect(page.getByTestId("creator-active")).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    // Reset creator-mode so it does not leak into other test files that share
    // the mock Supabase server.
    const supabasePort = Number(process.env.MOCK_SUPABASE_PORT ?? "5499");
    await page.request.post(`http://127.0.0.1:${supabasePort}/mock/creator-mode`, {
      data: { enabled: false },
    });
  });

  test("renders the active panel with on-chain status, stats, and leaderboard", async ({ page }) => {
    await expect(page.getByTestId("creator-active")).toBeVisible();
    // On-chain status.
    await expect(page.getByTestId("onchain-registered")).toContainText("yes");
    await expect(page.getByTestId("onchain-owner")).toContainText(STUB_ADDRESS);
    await expect(page.getByTestId("onchain-payout")).toContainText("GBPAYOUTADDRESS");
    await expect(page.getByTestId("onchain-paused")).toContainText("active");
    // Stats: Bob 500 + Troll 1 + Anonymous 9999 = 10500 confirmed (Troll is
    // hidden but still counted in stats). Count = 3.
    await expect(page.getByTestId("creator-total-received")).toContainText("10500");
    await expect(page.getByTestId("creator-donation-count")).toContainText("3");
    // Leaderboard: visible confirmed with logged-in donors only -> Bob (500).
    // Anonymous (null user_id) and Troll (hidden) are excluded.
    await expect(page.getByTestId("creator-leaderboard")).toContainText("Bob");
  });

  test("renders the overlay URL with the handle and a copy button", async ({ page }) => {
    await expect(page.getByTestId("overlay-url")).toContainText(/\/overlay\/ada/);
    await expect(page.getByTestId("overlay-copy")).toBeVisible();
  });

  test("moderation list shows donations including hidden ones", async ({ page }) => {
    const list = page.getByTestId("moderation-list");
    await expect(list).toContainText("Bob");
    await expect(list).toContainText("Troll");
  });

  test("toggling a donation's visibility persists via the moderation RLS PATCH", async ({ page }) => {
    // Bob's donation (e1) is visible -> button says "Hide".
    const toggle = page.getByTestId("moderation-toggle-00000000-0000-0000-0000-000000000e1");
    await expect(toggle).toHaveText("Hide");
    await toggle.click();
    // The button flips to "Show" after the PATCH resolves and local state updates.
    await expect(toggle).toHaveText("Show");
  });

  test("payout update signs + submits and shows pending, then Realtime mirrors the new address", async ({ page }) => {
    await page.getByTestId("payout-update-input").fill("GBNEWPAYOUT");
    await page.getByTestId("payout-update-submit").click();
    await expect(page.getByText(/Payout update submitted/i)).toBeVisible();
    // Drive the Realtime flip via the stub.
    await page.evaluate(() =>
      (window as unknown as { __pushCreatorUpdate?: (n: { payout_address?: string }) => void }).__pushCreatorUpdate?.({ payout_address: "GBNEWPAYOUT" }),
    );
    await expect(page.getByTestId("onchain-payout")).toContainText("GBNEWPAYOUT");
  });

  test("pause toggle signs + submits and shows pending, then Realtime mirrors paused", async ({ page }) => {
    const toggle = page.getByTestId("pause-toggle");
    await expect(toggle).toHaveText("Pause");
    await toggle.click();
    await expect(page.getByText(/Pause submitted/i)).toBeVisible();
    // Drive the Realtime flip via the stub.
    await page.evaluate(() =>
      (window as unknown as { __pushCreatorUpdate?: (n: { paused?: boolean }) => void }).__pushCreatorUpdate?.({ paused: true }),
    );
    await expect(page.getByTestId("onchain-paused")).toContainText("paused");
    await expect(page.getByTestId("pause-status")).toContainText("paused");
  });

  test("editing display name + bio persists via the owner UPDATE RLS path", async ({ page }) => {
    const active = page.getByTestId("creator-active");
    await active.getByLabel(/display name/i).fill("Ada Lovelace");
    await active.getByLabel(/bio/i).fill("First programmer.");
    await page.getByTestId("creator-profile-save").click();
    await expect(page.getByTestId("creator-save-status")).toContainText(/saved/i);
    // The local state updates after the PATCH resolves.
    await expect(active.getByLabel(/display name/i)).toHaveValue("Ada Lovelace");
    await expect(active.getByLabel(/bio/i)).toHaveValue("First programmer.");
  });
});
