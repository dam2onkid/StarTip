import { test, expect, type Page } from "@playwright/test";
import { expectUnifiedNav } from "./nav-helpers";

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

async function installSeams(
  page: Page,
  donateResult: "success" | "paused" | "no-trustline",
) {
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
    // Donate stub: succeeds, throws a Paused error, or exercises the two-op
    // change_trust + donate() path (no-trustline). The no-trustline branch
    // records the needsTrustline arg so the E2E can assert the two-op path was
    // taken, and surfaces the trustline guidance via the checkTrustline seam.
    (window as unknown as { __STARTIP_DONATE_STUB__?: unknown }).__STARTIP_DONATE_STUB__ = {
      donateOnChain: async (args?: { needsTrustline?: boolean }) => {
        if (result === "paused") {
          const err = new Error("This creator is currently paused and cannot receive donations.");
          (err as unknown as { name: string }).name = "DonateError";
          (err as unknown as { code: string }).code = "Paused";
          throw err;
        }
        if (result === "no-trustline") {
          (window as unknown as { __STARTIP_DONATE_STUB_ARGS__?: unknown }).__STARTIP_DONATE_STUB_ARGS__ =
            args;
        }
        return { status: "PENDING", hash: "deadbeef".repeat(8) };
      },
      // Trustline check seam: returns false in the no-trustline scenario so the
      // form shows the guidance and builds the two-op transaction.
      checkTrustline:
        result === "no-trustline"
          ? async () => false
          : async () => true,
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

    // The donate form heading is visible (the redesigned form renders the
    // creator's display name as the h1 with a "Donating to" label above it).
    await expect(page.getByText(/donating to/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /ada lovelace/i })).toBeVisible();

    // Connect wallet via the unified nav's Donate Wallet connector (issue 02
    // moved the connector out of the form and into the nav right cluster).
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("button", { name: /connect wallet/i })
      .click();
    await expect(page.getByText(/Connected:/i)).toBeVisible();

    // Wait for the token picker to populate from the mock Supabase tokens
    // endpoint. Native <option> elements are not "visible" in Playwright's
    // a11y tree until the <select> is open, so assert the combobox is enabled
    // and auto-selected the first token (CUSDC) instead.
    await expect(page.getByRole("combobox", { name: /token/i })).toBeEnabled();
    await expect(page.getByRole("combobox", { name: /token/i })).toHaveValue("CUSDC");

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

    // Connect wallet via the unified nav connector (see happy path note).
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("button", { name: /connect wallet/i })
      .click();
    await expect(page.getByText(/Connected:/i)).toBeVisible();

    // Wait for the token picker (see happy path note on native <option> visibility).
    await expect(page.getByRole("combobox", { name: /token/i })).toBeEnabled();
    await expect(page.getByRole("combobox", { name: /token/i })).toHaveValue("CUSDC");

    // Enter amount and submit.
    await page.getByPlaceholder("0.00").fill("1.0");
    await page.getByRole("button", { name: /donate/i }).click();

    // Verify the Paused error message is displayed. Scoped to the form so the
    // Next.js route announcer (also `role="alert"`) is not matched.
    await expect(
      page.locator("form").getByRole("alert"),
    ).toHaveText(/paused and cannot receive donations/i);
  });

  test("no-trustline path: shows guidance and builds a change_trust + donate() two-op transaction", async ({ page }) => {
    await installSeams(page, "no-trustline");
    await routeApi(page);

    await page.goto("/creator/ada/donate");

    // Connect wallet via the unified nav connector (see happy path note).
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("button", { name: /connect wallet/i })
      .click();
    await expect(page.getByText(/Connected:/i)).toBeVisible();

    // Wait for the token picker (see happy path note on native <option> visibility).
    await expect(page.getByRole("combobox", { name: /token/i })).toBeEnabled();
    await expect(page.getByRole("combobox", { name: /token/i })).toHaveValue("CUSDC");

    // The trustline guidance renders (the checkTrustline seam returns false).
    await expect(page.getByText(/trustline to this token is required/i)).toBeVisible();

    // Enter amount and submit.
    await page.getByPlaceholder("0.00").fill("1.0");
    await page.getByRole("button", { name: /donate/i }).click();

    // Verify success.
    await expect(page.getByText(/donation confirmed/i)).toBeVisible();

    // Assert the donate stub received needsTrustline: true (the two-op path).
    const args = await page.evaluate(() =>
      (window as unknown as { __STARTIP_DONATE_STUB_ARGS__?: { needsTrustline?: boolean } })
        .__STARTIP_DONATE_STUB_ARGS__,
    );
    expect(args?.needsTrustline).toBe(true);
  });

  test("shows the unified nav with the Discover link on the donate page", async ({ page }) => {
    await installSeams(page, "success");
    await routeApi(page);
    await page.goto("/creator/ada/donate");
    await expectUnifiedNav(page);
  });
});
