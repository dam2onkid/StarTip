import { test, expect, type Page } from "@playwright/test";

/**
 * Creator onboarding four-gate state machine E2E.
 *
 * The flow is driven with deterministic test seams injected into the page
 * context before the dashboard loads:
 *
 *   - `window.__STARTIP_WALLET_STUB__`   — stands in for the Stellar Wallets
 *     Kit (connect / signMessage / signTransaction).
 *   - `window.__STARTIP_REGISTER_STUB__` — stands in for the client-side
 *     `register_creator` build/sign/submit path so the E2E does not have to
 *     mock the full Soroban JSON-RPC surface.
 *   - `window.__STARTIP_TREASURY_STUB__` — stands in for the on-chain
 *     `get_config` Treasury read used by the payout warning.
 *   - `window.__STARTIP_REALTIME_STUB__` — lets the test push the
 *     `onchain_registered = true` update to drive the `onchain_pending →
 *     active` flip without a WebSocket.
 *
 * The API routes (`/api/creators`, `/api/wallet/link/*`) are fulfilled via
 * `page.route` so the browser sees the real HTTP contract without the Next
 * routes having to talk to a real Stellar RPC.
 */

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

// Shared holders so the test can drive the Realtime flip after registration.
let pushActive: ((payout?: string) => void) | null = null;

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
    const address =
      "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";
    (window as unknown as { __STARTIP_WALLET_STUB__?: unknown }).__STARTIP_WALLET_STUB__ = {
      address,
      connect: async () => ({ address }),
      signMessage: async (message: string) => ({
        signedMessage: "deadbeef",
        signerAddress: address,
      }),
      signTransaction: async (xdr: string) => ({
        signedTxXdr: xdr,
        signerAddress: address,
      }),
      disconnect: async () => undefined,
    };
    (window as unknown as { __STARTIP_REGISTER_STUB__?: unknown }).__STARTIP_REGISTER_STUB__ = {
      registerCreatorOnChain: async () => ({ status: "PENDING", hash: "stub-tx-hash" }),
    };
    (window as unknown as { __STARTIP_TREASURY_STUB__?: unknown }).__STARTIP_TREASURY_STUB__ =
      async () => null;
    // Realtime seam: capture the onActive callback so the test can push the
    // onchain_registered flip. Returns an unsubscribe.
    (window as unknown as { __STARTIP_REALTIME_STUB__?: unknown }).__STARTIP_REALTIME_STUB__ = {
      subscribe: (onActive: (next: { onchain_registered?: boolean; payout_address?: string | null }) => void) => {
        (window as unknown as { __pushActive?: (p?: string) => void }).__pushActive = (payout?: string) =>
          onActive({ onchain_registered: true, payout_address: payout ?? "GBPAYOUT" });
        return () => undefined;
      },
    };
  });
}

async function routeApi(page: Page) {
  // /api/creators: dryRun availability (200 available) and real claim (200).
  await page.route("**/api/creators", async (route) => {
    const req = route.request();
    let body: { dryRun?: boolean; handle?: string } = {};
    try {
      body = JSON.parse(req.postData() ?? "{}");
    } catch {
      body = {};
    }
    if (body.dryRun) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true, handle: body.handle }) });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ handle: body.handle, handle_hash: "ab".repeat(32), owner_address: null, onchain_registered: false }),
      });
    }
  });

  // /api/wallet/link/challenge -> human-readable challenge.
  await page.route("**/api/wallet/link/challenge", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ challenge: "StarTip wallet link\nHandle: ada\nProfile: dead\nNonce: beef" }),
    });
  });

  // /api/wallet/link -> owner_address written.
  await page.route("**/api/wallet/link", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ owner_address: STUB_ADDRESS }),
    });
  });
}

test.describe("Creator onboarding four-gate flow", () => {
  test.beforeEach(async ({ page }) => {
    pushActive = null;
    await installSeams(page);
    await routeApi(page);
    await establishSession(page);
    // Capture the Realtime push handle after the dashboard mounted.
    await page.waitForFunction(() => !!(window as unknown as { __pushActive?: unknown }).__pushActive);
    pushActive = async (payout?: string) => {
      await page.evaluate((p) => (window as unknown as { __pushActive?: (p?: string) => void }).__pushActive?.(p), payout);
    };
  });

  test("renders the profile_pending gate with a Become a Creator action", async ({ page }) => {
    await expect(page.getByRole("button", { name: /become a creator/i })).toBeVisible();
    await expect(page.getByText(/Claim a Handle/i)).toBeVisible();
  });

  test("claim handle shows availability, then advances to the wallet gate", async ({ page }) => {
    await page.getByRole("button", { name: /become a creator/i }).click();
    const handleInput = page.getByPlaceholder("ada-lovelace");
    await handleInput.fill("ada");
    await expect(page.getByText(/Handle is available/i)).toBeVisible();
    await page.getByRole("button", { name: /^Claim$/i }).click();
    await expect(page.getByText(/Link your Stellar wallet/i)).toBeVisible();
  });

  test("wallet link displays the challenge, signs, and advances to on-chain", async ({ page }) => {
    // Advance to wallet gate first.
    await page.getByRole("button", { name: /become a creator/i }).click();
    await page.getByPlaceholder("ada-lovelace").fill("ada");
    await page.getByRole("button", { name: /^Claim$/i }).click();
    await expect(page.getByText(/Link your Stellar wallet/i)).toBeVisible();

    await page.getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByText(/Connected:/i)).toBeVisible();
    await page.getByRole("button", { name: /sign challenge & link/i }).click();
    await expect(page.getByPlaceholder("G…")).toBeVisible();
  });

  test("payout address warns when set to the contract address", async ({ page }) => {
    // Advance to on-chain gate.
    await page.getByRole("button", { name: /become a creator/i }).click();
    await page.getByPlaceholder("ada-lovelace").fill("ada");
    await page.getByRole("button", { name: /^Claim$/i }).click();
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await page.getByRole("button", { name: /sign challenge & link/i }).click();
    await expect(page.getByPlaceholder("G…")).toBeVisible();

    // The contract id is "test-contract" (set by the E2E server env).
    await page.getByPlaceholder("G…").fill("test-contract");
    await expect(page.getByText(/contract address/i)).toBeVisible();
  });

  test("register submission shows registration pending, then Realtime flips to active", async ({ page }) => {
    // Advance to on-chain gate.
    await page.getByRole("button", { name: /become a creator/i }).click();
    await page.getByPlaceholder("ada-lovelace").fill("ada");
    await page.getByRole("button", { name: /^Claim$/i }).click();
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await page.getByRole("button", { name: /sign challenge & link/i }).click();
    await expect(page.getByPlaceholder("G…")).toBeVisible();

    await page.getByPlaceholder("G…").fill("GBPAYOUT");
    await page.getByRole("button", { name: /register on-chain/i }).click();
    await expect(page.getByText(/Registration submitted/i)).toBeVisible();

    // Drive the Realtime flip via the stub.
    await pushActive?.("GBPAYOUT");
    await expect(page.getByText(/You are live on-chain/i)).toBeVisible();
    await expect(page.getByTestId("creator-active")).toBeVisible();
  });
});
