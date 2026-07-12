// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { authError, authContext } from "@/lib/auth/test-helpers";

/**
 * POST /api/creators - claim a Handle. The route is a pure HTTP function:
 * authed via the AuthContext boundary, dual-source availability check against the
 * `profiles` table and on-chain `get_creator`, then a service-role write of
 * `handle` + `handle_hash`. The auth boundary and availability check are mocked;
 * tests assert on status, body, and the side-effect writes.
 */

const USER_ID = "00000000-0000-0000-0000-000000000001";

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
  networkPassphrase: "Test SDF Network ; September 2015",
}));

const checkHandleAvailability = vi.fn();
vi.mock("@/lib/creators/handle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/creators/handle")>()),
  checkHandleAvailability,
}));

function req(body: unknown) {
  return new NextRequest("http://localhost/api/creators", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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

describe("POST /api/creators", () => {
  beforeEach(() => {
    requireAuthedProfileMock.mockReset();
    serviceFrom.mockReset();
    checkHandleAvailability.mockReset();
    requireAuthedProfileMock.mockResolvedValue(
      authContext({ id: "p1", user_id: USER_ID, handle: null, onchain_registered: false }),
    );
  });

  it("returns 401 when there is no session", async () => {
    requireAuthedProfileMock.mockResolvedValue(authError("unauthorized", 401));
    const { POST } = await import("@/app/api/creators/route");
    const res = await POST(req({ handle: "ada" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 400 when the handle fails validation", async () => {
    const { POST } = await import("@/app/api/creators/route");
    const res = await POST(req({ handle: "x" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_handle" });
  });

  it("returns 404 when the caller has no profile row", async () => {
    requireAuthedProfileMock.mockResolvedValue(authError("profile_not_found", 404));
    const { POST } = await import("@/app/api/creators/route");
    const res = await POST(req({ handle: "ada" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
  });

  it("returns 409 when the caller is already registered on-chain", async () => {
    requireAuthedProfileMock.mockResolvedValue(
      authContext({ id: "p1", user_id: USER_ID, handle: "ada", onchain_registered: true }),
    );
    const { POST } = await import("@/app/api/creators/route");
    const res = await POST(req({ handle: "newhandle" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_registered" });
  });

  it("returns 409 with reason offchain_taken when the handle is reserved by another user", async () => {
    checkHandleAvailability.mockResolvedValue({ available: false, reason: "offchain_taken" });
    const { POST } = await import("@/app/api/creators/route");
    const res = await POST(req({ handle: "ada" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "handle_taken", reason: "offchain_taken" });
    expect(checkHandleAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ handle: "ada", excludeUserId: USER_ID }),
    );
  });

  it("returns 409 with reason onchain_taken when get_creator returns Some", async () => {
    checkHandleAvailability.mockResolvedValue({ available: false, reason: "onchain_taken" });
    const { POST } = await import("@/app/api/creators/route");
    const res = await POST(req({ handle: "ada" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "handle_taken", reason: "onchain_taken" });
  });

  it("claims the handle and returns the Creator fields on success", async () => {
    checkHandleAvailability.mockResolvedValue({ available: true });
    const recorder = { payload: null as unknown, filter: null as unknown };
    serviceFrom.mockImplementation(() => updateChain(recorder));
    const { POST } = await import("@/app/api/creators/route");
    const res = await POST(req({ handle: "Ada" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handle).toBe("ada");
    expect(body.handle_hash).toMatch(/^[0-9a-f]{64}$/);
    // The service-role write stored the normalized handle + sha256 hex, scoped
    // to the caller's user_id.
    expect(recorder.payload).toMatchObject({ handle: "ada" });
    expect((recorder.payload as { handle_hash: string }).handle_hash).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(recorder.filter).toEqual({ c: "user_id", v: USER_ID });
  });

  it("dryRun returns 200 { available: true } without writing", async () => {
    checkHandleAvailability.mockResolvedValue({ available: true });
    const recorder = { payload: null as unknown, filter: null as unknown };
    serviceFrom.mockImplementation(() => updateChain(recorder));
    const { POST } = await import("@/app/api/creators/route");
    const res = await POST(req({ handle: "ada", dryRun: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true, handle: "ada" });
    // No service-role write occurred.
    expect(recorder.payload).toBeNull();
  });

  it("dryRun still returns 409 handle_taken when the handle is reserved", async () => {
    checkHandleAvailability.mockResolvedValue({ available: false, reason: "offchain_taken" });
    const { POST } = await import("@/app/api/creators/route");
    const res = await POST(req({ handle: "ada", dryRun: true }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "handle_taken", reason: "offchain_taken" });
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const { POST } = await import("@/app/api/creators/route");
    const res = await POST(
      new NextRequest("http://localhost/api/creators", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });
});
