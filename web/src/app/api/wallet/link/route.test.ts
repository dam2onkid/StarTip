// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * POST /api/wallet/link — verify a `signMessage` signature against the
 * reconstructed challenge, enforce nonce + expiry, allow re-link only while
 * `onchain_registered = false`, reject `signerAddress` mismatch, and write
 * `owner_address` (service role). Signature verification uses the real
 * Stellar SDK so the SEP-53 prefix handling is exercised end-to-end.
 */

const USER_ID = "00000000-0000-0000-0000-000000000001";
const HANDLE = "ada";
const { handleHashHex } = await import("@/lib/creators/handle");
const HANDLE_HASH_HEX = handleHashHex(HANDLE);

// A real Stellar keypair the "wallet" signs with. The route verifies with the
// public key only, exactly like it would against a Freighter signature.
const SIGNER = StellarSdk.Keypair.random();
const ADDRESS = SIGNER.publicKey();

const getUser = vi.fn();
const serverFrom = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser },
    from: serverFrom,
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: serviceFrom })),
}));

vi.mock("@/lib/stellar/client", () => ({
  contractId: "C-TEST-CONTRACT",
  networkPassphrase: "Test SDF Network ; September 2015",
}));

function req(body: unknown) {
  return new NextRequest("http://localhost/api/wallet/link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function profileChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return chain;
}

function updateChain(recorder: { payload: unknown; filter: unknown }) {
  const thenable = {
    eq: vi.fn((c: string, v: unknown) => {
      recorder.filter = { c, v };
      return thenable;
    }),
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onFulfilled),
  };
  return { update: vi.fn((payload: unknown) => { recorder.payload = payload; return thenable; }) };
}

/** Build a profile row with a live (non-expired) nonce. */
function profileWithNonce(over: Record<string, unknown> = {}) {
  const nonce = "11".repeat(32);
  const challenge =
    `StarTip wallet link\n` +
    `Handle: ${HANDLE}\n` +
    `Profile: ${HANDLE_HASH_HEX}\n` +
    `Nonce: ${nonce}`;
  return {
    id: "p1",
    user_id: USER_ID,
    handle: HANDLE,
    handle_hash: "\\x" + HANDLE_HASH_HEX,
    owner_address: null,
    onchain_registered: false,
    wallet_link_nonce: nonce,
    wallet_link_nonce_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    _challenge: challenge,
    ...over,
  };
}

function sign(challenge: string, kp: StellarSdk.Keypair = SIGNER) {
  // Freighter / SEP-53 wallets sign SHA256("Stellar Signed Message:\n" || msg),
  // not the raw challenge bytes. Mirror that here so the test exercises the
  // real verification path the route now uses.
  const prehash = StellarSdk.hash(
    Buffer.concat([
      Buffer.from("Stellar Signed Message:\n"),
      Buffer.from(challenge, "utf8"),
    ]),
  );
  return kp.sign(prehash).toString("hex");
}

describe("POST /api/wallet/link", () => {
  beforeEach(() => {
    getUser.mockReset();
    serverFrom.mockReset();
    serviceFrom.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST(req({ address: ADDRESS, signedMessage: "deadbeef" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 400 when the body is missing required fields", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST(req({ address: ADDRESS }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 404 when the caller has no profile", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() => profileChain(null));
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST(req({ address: ADDRESS, signedMessage: "deadbeef" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
  });

  it("returns 409 'already_linked' when linked and registered on-chain", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profileChain(profileWithNonce({
        owner_address: "GOLDWALLET",
        onchain_registered: true,
      })),
    );
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST(req({ address: ADDRESS, signedMessage: "deadbeef" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_linked" });
  });

  it("returns 400 'signer_mismatch' when signerAddress differs from address", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() => profileChain(profileWithNonce()));
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST(
      req({ address: ADDRESS, signedMessage: "deadbeef", signerAddress: "GDOTHER" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "signer_mismatch" });
  });

  it("returns 400 'nonce_expired' when the nonce expiry is in the past", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const profile = profileWithNonce({
      wallet_link_nonce_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    serverFrom.mockImplementation(() => profileChain(profile));
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST(req({ address: ADDRESS, signedMessage: sign(profile._challenge) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "nonce_expired" });
  });

  it("returns 400 'nonce_missing' when no nonce is stored", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profileChain(profileWithNonce({ wallet_link_nonce: null, wallet_link_nonce_expires_at: null })),
    );
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST(req({ address: ADDRESS, signedMessage: "deadbeef" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "nonce_missing" });
  });

  it("returns 400 'invalid_signature' when the signature does not verify", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() => profileChain(profileWithNonce()));
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST(req({ address: ADDRESS, signedMessage: "00".repeat(64) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_signature" });
  });

  it("writes owner_address, nulls the nonce, and returns owner_address on a valid signature", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const profile = profileWithNonce();
    serverFrom.mockImplementation(() => profileChain(profile));
    const recorder = { payload: null as unknown, filter: null as unknown };
    serviceFrom.mockImplementation(() => updateChain(recorder));
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST(
      req({ address: ADDRESS, signedMessage: sign(profile._challenge), signerAddress: ADDRESS }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ owner_address: ADDRESS });
    const payload = recorder.payload as {
      owner_address: string;
      wallet_link_nonce: unknown;
      wallet_link_nonce_expires_at: unknown;
    };
    expect(payload.owner_address).toBe(ADDRESS);
    expect(payload.wallet_link_nonce).toBeNull();
    expect(payload.wallet_link_nonce_expires_at).toBeNull();
    expect(recorder.filter).toEqual({ c: "user_id", v: USER_ID });
  });

  it("allows re-link to a new wallet when onchain_registered is false", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const profile = profileWithNonce({ owner_address: "GOLDWALLET", onchain_registered: false });
    serverFrom.mockImplementation(() => profileChain(profile));
    serviceFrom.mockImplementation(() => updateChain({ payload: null, filter: null }));
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST(req({ address: ADDRESS, signedMessage: sign(profile._challenge) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ owner_address: ADDRESS });
  });

  it("returns 400 'invalid_address' when the address is not a valid public key", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() => profileChain(profileWithNonce()));
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST(req({ address: "not-a-key", signedMessage: "deadbeef" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_address" });
  });
});
