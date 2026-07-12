// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/**
 * POST /api/creators/reconcile - recover a Creator whose on-chain registration
 * succeeded but was never mirrored by the indexer. Auths via the AuthContext
 * boundary, reads `get_creator(sha256(handle))` on-chain, and flips
 * `onchain_registered` when the on-chain owner matches the linked wallet. The
 * auth boundary and on-chain read are mocked; tests assert on status, body, and
 * the service-role write.
 */

const USER_ID = "00000000-0000-0000-0000-000000000001";
const OWNER = "GADK72HP4ZKY2ZH2JGJDOMXCR23CFFALJZCDOQD6VOA2CFSRJXJDG5BN";
const OTHER_OWNER = "GB111111111111111111111111111111111111111111111111111111";

const requireAuthedProfileMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/context", () => ({
  requireAuthedProfile: requireAuthedProfileMock,
}));

const serviceFrom = vi.fn();
vi.mock("@startip/shared/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: serviceFrom })),
}));

vi.mock("@startip/shared/stellar/server", () => ({
  rpc: { simulateTransaction: vi.fn() },
}));

vi.mock("@/lib/stellar/client", () => ({
  contractId: "C-TEST-CONTRACT",
}));

const readCreatorOnChain = vi.fn();
vi.mock("@/lib/creators/handle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/creators/handle")>()),
  readCreatorOnChain,
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

/** A service-role update chain that records the payload + filter and resolves. */
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

describe("POST /api/creators/reconcile", () => {
  beforeEach(() => {
    requireAuthedProfileMock.mockReset();
    serviceFrom.mockReset();
    readCreatorOnChain.mockReset();
    requireAuthedProfileMock.mockResolvedValue(
      authContext({ id: "p1", user_id: USER_ID, handle: "ada", owner_address: OWNER, onchain_registered: false }),
    );
  });

  it("returns 401 when there is no session", async () => {
    requireAuthedProfileMock.mockResolvedValue(authError("unauthorized", 401));
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 404 when the caller has no profile row", async () => {
    requireAuthedProfileMock.mockResolvedValue(authError("profile_not_found", 404));
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
  });

  it("returns 200 onchain_registered:true without on-chain read when already active", async () => {
    requireAuthedProfileMock.mockResolvedValue(
      authContext({ id: "p1", user_id: USER_ID, handle: "ada", owner_address: OWNER, onchain_registered: true }),
    );
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ onchain_registered: true });
    expect(readCreatorOnChain).not.toHaveBeenCalled();
  });

  it("returns 409 not_ready when the handle is not yet claimed", async () => {
    requireAuthedProfileMock.mockResolvedValue(
      authContext({ id: "p1", user_id: USER_ID, handle: null, owner_address: OWNER, onchain_registered: false }),
    );
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_ready" });
  });

  it("returns 409 not_ready when the wallet is not yet linked", async () => {
    requireAuthedProfileMock.mockResolvedValue(
      authContext({ id: "p1", user_id: USER_ID, handle: "ada", owner_address: null, onchain_registered: false }),
    );
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_ready" });
  });

  it("returns 200 onchain_registered:false when get_creator returns None", async () => {
    readCreatorOnChain.mockResolvedValue(null);
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ onchain_registered: false });
  });

  it("returns 409 owner_mismatch when the on-chain owner differs from the linked wallet", async () => {
    readCreatorOnChain.mockResolvedValue({ owner: OTHER_OWNER, payout_address: OTHER_OWNER, active: true });
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "owner_mismatch" });
  });

  it("flips onchain_registered and stores payout_address when the owner matches", async () => {
    readCreatorOnChain.mockResolvedValue({ owner: OWNER, payout_address: OWNER, active: true });
    const recorder = { payload: null as unknown, filter: null as unknown };
    serviceFrom.mockImplementation(() => updateChain(recorder));
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ onchain_registered: true, payout_address: OWNER });
    expect(recorder.payload).toMatchObject({
      onchain_registered: true,
      payout_address: OWNER,
    });
    expect((recorder.payload as { onchain_registered_at: string }).onchain_registered_at).toBeTruthy();
    expect(recorder.filter).toEqual({ c: "user_id", v: USER_ID });
  });

  it("returns 500 onchain_read_failed when the on-chain read throws", async () => {
    readCreatorOnChain.mockRejectedValue(new Error("simulate get_creator failed: boom"));
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "onchain_read_failed" });
  });
});
