import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * Creator onboarding four-gate state machine E2E.
 *
 * The flow is driven with deterministic test seams injected into the page
 * context before the dashboard loads:
 *
 *   - `window.__STARTIP_WALLET_STUB__`   — stands in for the Stellar Wallets
 *     Kit (connect / signMessage / signTransaction). `signMessage` delegates
 *     to `window.__signStubMessage` (exposed via `page.exposeFunction`) which
 *     signs with a real Ed25519 keypair using SEP-53 prehash, so the real
 *     `/api/wallet/link` verification path is exercised end-to-end.
 *   - `window.__STARTIP_REGISTER_STUB__` — stands in for the client-side
 *     `register_creator` build/sign/submit path so the E2E does not have to
 *     mock the full Soroban JSON-RPC surface.
 *   - `window.__STARTIP_TREASURY_STUB__` — stands in for the on-chain
 *     `get_config` Treasury read used by the payout warning.
 *   - `window.__STARTIP_REALTIME_STUB__` — lets the test push the
 *     `onchain_registered = true` update to drive the `onchain_pending →
 *     active` flip without a WebSocket.
 *
 * Only `/api/creators` is fulfilled via `page.route` (it needs an on-chain
 * availability check that would require a real Stellar RPC). The
 * `/api/wallet/link/challenge` and `/api/wallet/link` routes run for real
 * against the mock Supabase, and the wallet stub signs with a real keypair
 * using SEP-53 prehash, so the full signature verification path is covered.
 */

// Real Ed25519 keypair the wallet stub signs with. The corresponding public
// key is the "connected" address the dashboard sees.
const SIGNER = StellarSdk.Keypair.random();

// Mock Supabase port (must match tests/e2e-server.mjs).
const MOCK_SUPABASE_PORT = 5499;

// Shared holders so the test can drive the Realtime flip after registration.
let pushActive: ((payout?: string) => void) | null = null;

async function establishSession(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("fan@example.com");
  await page.getByLabel(/password/i).fill("secret123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function installSeams(page: Page) {
  const publicKey = SIGNER.publicKey();

  // Bridge: the browser stub calls this Node.js function to sign with a real
  // Ed25519 keypair using SEP-53 prehash (SHA256("Stellar Signed Message:\n"
  // || message)). This lets the real /api/wallet/link route verify the
  // signature end-to-end instead of being short-circuited by a page.route mock.
  await page.exposeFunction("__signStubMessage", async (message: string) => {
    const prehash = StellarSdk.hash(
      Buffer.concat([
        Buffer.from("Stellar Signed Message:\n"),
        Buffer.from(message, "utf8"),
      ]),
    );
    return {
      signedMessage: SIGNER.sign(prehash).toString("hex"),
      signerAddress: publicKey,
    };
  });

  await page.addInitScript((pk: string) => {
    (window as unknown as { __STARTIP_WALLET_STUB__?: unknown }).__STARTIP_WALLET_STUB__ = {
      address: pk,
      connect: async () => ({ address: pk }),
      signMessage: async (message: string) =>
        (window as unknown as {
          __signStubMessage?: (m: string) => Promise<{ signedMessage: string; signerAddress: string }>;
        }).__signStubMessage!(message),
      signTransaction: async (xdr: string) => ({
        signedTxXdr: xdr,
        signerAddress: pk,
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
  }, publicKey);
}

async function routeApi(page: Page) {
  // /api/creators: dryRun availability (200 available) and real claim (200).
  // The claim also PATCHes the mock Supabase profile so the real
  // /api/wallet/link/challenge and /api/wallet/link routes can read the handle.
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
      // Set the handle on the mock Supabase profile so the real challenge
      // and link routes (which are NOT mocked) can read it.
      const handle = body.handle ?? "";
      const handleHash = createHash("sha256").update(handle).digest("hex");
      await fetch(`http://127.0.0.1:${MOCK_SUPABASE_PORT}/rest/v1/profiles`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, handle_hash: "\\x" + handleHash }),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ handle: body.handle, handle_hash: handleHash, owner_address: null, onchain_registered: false }),
      });
    }
  });

  // /api/wallet/link/challenge and /api/wallet/link are NOT mocked — the real
  // Next.js routes run against the mock Supabase, and the wallet stub signs
  // with a real keypair using SEP-53 prehash (see installSeams). This
  // exercises the full challenge → sign → verify → link path end-to-end.
}

// Serial: the wallet-link flow writes a nonce to the shared mock Supabase
// profile (challenge) and reads it back (link). If tests run in parallel, one
// test's nonce overwrites another's, causing invalid_signature. Serial mode
// ensures only one onboarding test touches the nonce at a time.
test.describe.serial("Creator onboarding four-gate flow", () => {
  test.beforeEach(async ({ page }) => {
    pushActive = null;
    // Reset the mock Supabase profile to the default un-onboarded state.
    // The mock server is shared across all test files, and other tests (or a
    // previous run of this file) may have mutated the in-memory profile
    // (handle, owner_address, nonce, etc.). Without this reset the onboarding
    // gates may render in the wrong state.
    await fetch(`http://127.0.0.1:${MOCK_SUPABASE_PORT}/rest/v1/profiles`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle: null,
        handle_hash: null,
        owner_address: null,
        onchain_registered: false,
        wallet_link_nonce: null,
        wallet_link_nonce_expires_at: null,
        payout_address: null,
        paused: false,
        display_name: "Fan",
        bio: null,
        avatar_url: null,
      }),
    });
    await installSeams(page);
    await routeApi(page);
    await establishSession(page);
    // The dashboard defaults to the Donor tab; switch to the Creator tab so
    // the CreatorTab (and its Realtime seam) mounts before capturing the push
    // handle.
    await page.getByRole("tab", { name: /creator/i }).click();
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

    await page.getByRole("main").getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByText(/Connected:/i)).toBeVisible();
    await page.getByRole("button", { name: /sign challenge & link/i }).click();
    await expect(page.getByPlaceholder("G…")).toBeVisible();
  });

  test("payout address warns when set to the contract address", async ({ page }) => {
    // Advance to on-chain gate.
    await page.getByRole("button", { name: /become a creator/i }).click();
    await page.getByPlaceholder("ada-lovelace").fill("ada");
    await page.getByRole("button", { name: /^Claim$/i }).click();
    await page.getByRole("main").getByRole("button", { name: /connect wallet/i }).click();
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
    await page.getByRole("main").getByRole("button", { name: /connect wallet/i }).click();
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
