// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * POST /api/creators/reconcile — recover a Creator whose on-chain registration
 * succeeded but was never mirrored by the indexer. Auths via the SSR client,
 * reads `get_creator(sha256(handle))` on-chain, and flips `onchain_registered`
 * when the on-chain owner matches the linked wallet. Supabase and the on-chain
 * read are mocked; tests assert on status, body, and the service-role write.
 */

const USER_ID = "00000000-0000-0000-0000-000000000001";
const OWNER = "GADK72HP4ZKY2ZH2JGJDOMXCR23CFFALJZCDOQD6VOA2CFSRJXJDG5BN";
const OTHER_OWNER = "GB111111111111111111111111111111111111111111111111111111";

const getUser = vi.fn();
const serverFrom = vi.fn();
const serviceFrom = vi.fn();
const readCreatorOnChain = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser },
    from: serverFrom,
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: serviceFrom })),
}));

vi.mock("@/lib/stellar/server", () => ({
  rpc: { simulateTransaction: vi.fn() },
}));

vi.mock("@/lib/stellar/client", () => ({
  contractId: "C-TEST-CONTRACT",
}));

vi.mock("@/lib/creators/handle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/creators/handle")>()),
  readCreatorOnChain,
}));

/** A profiles select chain that resolves maybeSingle to `data`. */
function profilesChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return chain;
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
    getUser.mockReset();
    serverFrom.mockReset();
    serviceFrom.mockReset();
    readCreatorOnChain.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 404 when the caller has no profile row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() => profilesChain(null));
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
  });

  it("returns 200 onchain_registered:true without on-chain read when already active", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesChain({ id: "p1", user_id: USER_ID, handle: "ada", owner_address: OWNER, onchain_registered: true }),
    );
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ onchain_registered: true });
    expect(readCreatorOnChain).not.toHaveBeenCalled();
  });

  it("returns 409 not_ready when the handle is not yet claimed", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesChain({ id: "p1", user_id: USER_ID, handle: null, owner_address: OWNER, onchain_registered: false }),
    );
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_ready" });
  });

  it("returns 409 not_ready when the wallet is not yet linked", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesChain({ id: "p1", user_id: USER_ID, handle: "ada", owner_address: null, onchain_registered: false }),
    );
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_ready" });
  });

  it("returns 200 onchain_registered:false when get_creator returns None", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesChain({ id: "p1", user_id: USER_ID, handle: "ada", owner_address: OWNER, onchain_registered: false }),
    );
    readCreatorOnChain.mockResolvedValue(null);
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ onchain_registered: false });
  });

  it("returns 409 owner_mismatch when the on-chain owner differs from the linked wallet", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesChain({ id: "p1", user_id: USER_ID, handle: "ada", owner_address: OWNER, onchain_registered: false }),
    );
    readCreatorOnChain.mockResolvedValue({ owner: OTHER_OWNER, payout_address: OTHER_OWNER, active: true });
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "owner_mismatch" });
  });

  it("flips onchain_registered and stores payout_address when the owner matches", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesChain({ id: "p1", user_id: USER_ID, handle: "ada", owner_address: OWNER, onchain_registered: false }),
    );
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
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesChain({ id: "p1", user_id: USER_ID, handle: "ada", owner_address: OWNER, onchain_registered: false }),
    );
    readCreatorOnChain.mockRejectedValue(new Error("simulate get_creator failed: boom"));
    const { POST } = await import("@/app/api/creators/reconcile/route");
    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "onchain_read_failed" });
  });
});
