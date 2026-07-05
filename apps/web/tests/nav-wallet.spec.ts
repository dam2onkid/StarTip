import { test, expect, type Page } from "@playwright/test";
import { expectUnifiedNav } from "./nav-helpers";

/**
 * Nav Donate Wallet connector E2E (PRD: Unified hybrid navigation, issue 02).
 *
 * The connector is the nav's always-visible Donate Wallet surface. The flow is
 * driven with the existing `window.__STARTIP_WALLET_STUB__` test seam (the same
 * harness used by the donate and onboarding E2E suites) so connect / disconnect
 * are deterministic and no real browser wallet is required.
 *
 * Coverage:
 *   - The connector renders in the nav on a public page in both auth states
 *     (here exercised on the unauthenticated landing page).
 *   - Disconnected -> Connect -> connected pill with truncated address.
 *   - The dropdown exposes "Copy address", "View on Stellar", "Disconnect".
 *   - "View on Stellar" links to the Stellar Expert testnet account URL (the
 *     E2E server sets NEXT_PUBLIC_STELLAR_NETWORK=testnet).
 *   - "Disconnect" reverts the pill to the disconnected "Connect wallet" button.
 *   - "Copy address" writes the full address to the clipboard (granted via
 *     context permissions so the async Clipboard API works in Chromium).
 */

const STUB_ADDRESS = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";
const TRUNCATED = `${STUB_ADDRESS.slice(0, 4)}…${STUB_ADDRESS.slice(-4)}`;

async function installWalletStub(page: Page) {
  await page.addInitScript((address) => {
    (window as unknown as { __STARTIP_WALLET_STUB__?: unknown }).__STARTIP_WALLET_STUB__ = {
      address,
      connect: async () => ({ address }),
      signMessage: async () => ({ signedMessage: "deadbeef", signerAddress: address }),
      signTransaction: async (xdr: string) => ({ signedTxXdr: xdr, signerAddress: address }),
      disconnect: async () => undefined,
    };
  }, STUB_ADDRESS);
}

test.describe("Nav Donate Wallet connector", () => {
  test.beforeEach(async ({ page }) => {
    // Grant clipboard-write so navigator.clipboard.writeText works in Chromium.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await installWalletStub(page);
  });

  test("renders the connector in the unified nav on the landing page", async ({ page }) => {
    await page.goto("/");
    await expectUnifiedNav(page);
  });

  test("connect transitions to the connected pill with the truncated address", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: /connect wallet/i }).click();

    // The connected pill is labelled with the full address for AT users.
    await expect(nav.getByLabel(new RegExp(STUB_ADDRESS, "i"))).toBeVisible();
    // The truncated address is rendered as visible text.
    await expect(nav.getByText(TRUNCATED)).toBeVisible();
  });

  test("the connected pill dropdown exposes Copy, View on Stellar, and Disconnect", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: /connect wallet/i }).click();
    const pill = nav.getByLabel(new RegExp(STUB_ADDRESS, "i"));
    await pill.click();

    await expect(page.getByRole("menuitem", { name: /copy address/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /view on stellar/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /disconnect/i })).toBeVisible();
  });

  test("View on Stellar links to the Stellar Expert testnet account URL", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: /connect wallet/i }).click();
    await nav.getByLabel(new RegExp(STUB_ADDRESS, "i")).click();

    const view = page.getByRole("menuitem", { name: /view on stellar/i });
    await expect(view).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/account/${STUB_ADDRESS}`,
    );
  });

  test("Copy address writes the full address to the clipboard", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: /connect wallet/i }).click();
    await nav.getByLabel(new RegExp(STUB_ADDRESS, "i")).click();

    await page.getByRole("menuitem", { name: /copy address/i }).click();

    // Read the clipboard via the page context (clipboard-read granted).
    const handle = await page.evaluateHandle(() => navigator.clipboard.readText());
    const copied = (await handle.jsonValue()) as string;
    expect(copied).toBe(STUB_ADDRESS);
  });

  test("Disconnect reverts the pill to the Connect wallet button", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: /connect wallet/i }).click();
    await nav.getByLabel(new RegExp(STUB_ADDRESS, "i")).click();

    await page.getByRole("menuitem", { name: /disconnect/i }).click();

    // The connected pill is gone and the Connect CTA returns.
    await expect(nav.getByLabel(new RegExp(STUB_ADDRESS, "i"))).toHaveCount(0);
    await expect(nav.getByRole("button", { name: /connect wallet/i })).toBeVisible();
  });
});
