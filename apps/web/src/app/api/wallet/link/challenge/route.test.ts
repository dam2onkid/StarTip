// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/**
 * POST /api/wallet/link/challenge - generate a 32-byte nonce with a 10-minute
 * expiry, store it on the caller's Profile (service role), and return the
 * human-readable challenge string. 409 when the wallet is already linked and
 * the Creator is registered on-chain (re-link is allowed only pre-registration).
 */

const USER_ID = "00000000-0000-0000-0000-000000000001";
const HANDLE = "ada";
// The route recomputes handle_hash from the handle, so the challenge carries
// the real sha256("ada"), not whatever bytea is stored on the profile.
const { handleHashHex } = await import("@/lib/creators/handle");
const HANDLE_HASH_HEX = handleHashHex(HANDLE);

const requireAuthedProfileMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/context", () => ({
  requireAuthedProfile: requireAuthedProfileMock,
}));

const serviceFrom = vi.fn();
vi.mock("@startip/shared/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: serviceFrom })),
}));

vi.mock("@/lib/stellar/client", () => ({
  contractId: "C-TEST-CONTRACT",
  networkPassphrase: "Test SDF Network ; September 2015",
}));

function authError(code: string, status: number) {
  return { ok: false, response: NextResponse.json({ error: code }, { status }) };
}

function authContext(profile: Record<string, unknown>) {
  return {
    ok: true,
    context: {
      user: { id: USER_ID },
      profile,
      supabase: { from: vi.fn() },
    },
  };
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

describe("POST /api/wallet/link/challenge", () => {
  beforeEach(() => {
    requireAuthedProfileMock.mockReset();
    serviceFrom.mockReset();
    requireAuthedProfileMock.mockResolvedValue(
      authContext({
        id: "p1",
        user_id: USER_ID,
        handle: HANDLE,
        handle_hash: "\\x" + HANDLE_HASH_HEX,
        owner_address: null,
        onchain_registered: false,
      }),
    );
  });

  it("returns 401 when there is no session", async () => {
    requireAuthedProfileMock.mockResolvedValue(authError("unauthorized", 401));
    const { POST } = await import("@/app/api/wallet/link/challenge/route");
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 404 when the caller has no profile", async () => {
    requireAuthedProfileMock.mockResolvedValue(authError("profile_not_found", 404));
    const { POST } = await import("@/app/api/wallet/link/challenge/route");
    const res = await POST();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
  });

  it("returns 400 when the caller has not claimed a handle yet", async () => {
    requireAuthedProfileMock.mockResolvedValue(
      authContext({ id: "p1", user_id: USER_ID, handle: null, handle_hash: null, owner_address: null, onchain_registered: false }),
    );
    const { POST } = await import("@/app/api/wallet/link/challenge/route");
    const res = await POST();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "no_handle" });
  });

  it("returns 409 'already_linked' when the wallet is linked and onchain_registered is true", async () => {
    requireAuthedProfileMock.mockResolvedValue(
      authContext({
        id: "p1",
        user_id: USER_ID,
        handle: HANDLE,
        handle_hash: "\\x" + HANDLE_HASH_HEX,
        owner_address: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
        onchain_registered: true,
      }),
    );
    const { POST } = await import("@/app/api/wallet/link/challenge/route");
    const res = await POST();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_linked" });
  });

  it("generates a nonce, stores it with a 10-minute expiry, and returns the challenge", async () => {
    const recorder = { payload: null as unknown, filter: null as unknown };
    serviceFrom.mockImplementation(() => updateChain(recorder));
    const { POST } = await import("@/app/api/wallet/link/challenge/route");
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    // Challenge is human-readable and carries handle, handle_hash hex, and nonce.
    expect(body.challenge).toContain(`Handle: ${HANDLE}`);
    expect(body.challenge).toContain(`Profile: ${HANDLE_HASH_HEX}`);
    expect(body.challenge).toMatch(/Nonce: [0-9a-f]{64}/);
    expect(body.challenge.startsWith("StarTip wallet link\n")).toBe(true);
    // The nonce + expiry were written via the service role, scoped to user_id.
    const payload = recorder.payload as { wallet_link_nonce: string; wallet_link_nonce_expires_at: string };
    expect(payload.wallet_link_nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.wallet_link_nonce_expires_at).toBeTruthy();
    expect(recorder.filter).toEqual({ c: "user_id", v: USER_ID });
  });

  it("allows re-link (returns 200) when owner_address is set but onchain_registered is false", async () => {
    requireAuthedProfileMock.mockResolvedValue(
      authContext({
        id: "p1",
        user_id: USER_ID,
        handle: HANDLE,
        handle_hash: "\\x" + HANDLE_HASH_HEX,
        owner_address: "GOLDWALLET",
        onchain_registered: false,
      }),
    );
    serviceFrom.mockImplementation(() => updateChain({ payload: null, filter: null }));
    const { POST } = await import("@/app/api/wallet/link/challenge/route");
    const res = await POST();
    expect(res.status).toBe(200);
  });
});
