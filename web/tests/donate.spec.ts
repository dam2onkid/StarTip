import { test, expect, type Page } from "@playwright/test";

/**
 * Donate flow E2E. The flow is driven with deterministic test seams injected
 * into the page context before the donate page loads:
 *
 *   - `window.__STARTIP_WALLET_STUB__` — stands in for the Stellar Wallets
 *     Kit (connect / signTransaction).
 *   - `window.__STARTIP_DONATE_STUB__` — stands in for the client-side
 *     `donate()` build/sign/submit path so the E2E does not have to mock the
 *     full Soroban JSON-RPC surface.
 *
 * The API routes (`/api/donations/prepare`, `/api/donations/confirm`) are
 * fulfilled via `page.route` so the browser sees the real HTTP contract
 * without the Next.js routes having to talk to a real Stellar RPC. The mock
 * Supabase server (e2e-server.mjs) returns the token allowlist from
 * `/rest/v1/tokens`.
 *
 * Two scenarios:
 *   1. Happy path: prepare -> donate -> confirm -> success.
 *   2. Error path: the donate stub throws a `Paused` error, and the UI
 *      surfaces the user-facing message.
 */

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

const PREPARE_RESPONSE = {
  donation_id: "00000000-0000-0000-0000-000000000001",
  donation_id_hash: "ab".repeat(32),
  contract_id: "C-TEST-CONTRACT",
  handle_hash: "cd".repeat(32),
  token_allowlist: [
    {
      contract_address: "CUSDC",
      symbol: "USDC",
      name: "USD Coin",
      issuer: null,
      decimals: 6,
      icon_url: null,
    },
  ],
};

async function installSeams(page: Page, donateResult: "success" | "paused") {
  await page.addInitScript((result) => {
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
    // Donate stub: either succeeds or throws a Paused error.
    (window as unknown as { __STARTIP_DONATE_STUB__?: unknown }).__STARTIP_DONATE_STUB__ = {
      donateOnChain: async () => {
        if (result === "paused") {
          const err = new Error("This creator is currently paused and cannot receive donations.");
          (err as unknown as { name: string }).name = "DonateError";
          (err as unknown as { code: string }).code = "Paused";
          throw err;
        }
        return { status: "PENDING", hash: "deadbeef".repeat(8) };
      },
    };
  }, donateResult);
}

async function routeApi(page: Page) {
  await page.route("**/api/donations/prepare", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PREPARE_RESPONSE),
    });
  });

  await page.route("**/api/donations/confirm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "confirmed" }),
    });
  });
}

test.describe("Donate flow", () => {
  test("happy path: connect, pick token, enter amount, submit, see success", async ({ page }) => {
    await installSeams(page, "success");
    await routeApi(page);

    await page.goto("/creator/ada/donate");

    // The heading is visible.
    await expect(page.getByRole("heading", { name: /donate to ada/i })).toBeVisible();

    // Connect wallet.
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByText(/Connected:/i)).toBeVisible();

    // Wait for the token picker to populate (from the mock Supabase tokens endpoint).
    await expect(page.getByRole("option", { name: /USDC/i })).toBeVisible();

    // Enter amount.
    await page.getByPlaceholder("0.00").fill("1.5");

    // Submit.
    await page.getByRole("button", { name: /donate/i }).click();

    // Verify success.
    await expect(page.getByText(/donation confirmed/i)).toBeVisible();
  });

  test("error path: paused creator surfaces a user-facing error message", async ({ page }) => {
    await installSeams(page, "paused");
    await routeApi(page);

    await page.goto("/creator/ada/donate");

    // Connect wallet.
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByText(/Connected:/i)).toBeVisible();

    // Wait for the token picker.
    await expect(page.getByRole("option", { name: /USDC/i })).toBeVisible();

    // Enter amount and submit.
    await page.getByPlaceholder("0.00").fill("1.0");
    await page.getByRole("button", { name: /donate/i }).click();

    // Verify the Paused error message is displayed.
    await expect(page.getByRole("alert")).toHaveText(
      /paused and cannot receive donations/i,
    );
  });
});
