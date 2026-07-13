// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { authError, authContext } from "@/lib/auth/test-helpers";

/**
 * POST /api/overlay/regenerate - generate a new Overlay ID for the caller.
 * The auth boundary and Supabase service role are mocked; tests assert on
 * status, body, and the side-effect write.
 */

const USER_ID = "00000000-0000-0000-0000-000000000001";
const CREATOR_PROFILE_ID = "11111111-1111-1111-1111-111111111111";

const requireAuthedProfileMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/context", () => ({
  requireAuthedProfile: requireAuthedProfileMock,
}));

const serviceFrom = vi.fn();
vi.mock("@startip/shared/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: serviceFrom })),
}));

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
  return {
    update: vi.fn((payload: unknown) => {
      recorder.payload = payload;
      return thenable;
    }),
  };
}

function activeProfileContext() {
  return authContext(
    {
      id: CREATOR_PROFILE_ID,
      user_id: USER_ID,
      handle: "ada",
      onchain_registered: true,
      paused: false,
    },
    serviceFrom,
  );
}

describe("POST /api/overlay/regenerate", () => {
  beforeEach(() => {
    requireAuthedProfileMock.mockReset();
    serviceFrom.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    requireAuthedProfileMock.mockResolvedValue(authError("unauthorized", 401));
    const { POST } = await import("@/app/api/overlay/regenerate/route");
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 400 when the caller has no profile row", async () => {
    requireAuthedProfileMock.mockResolvedValue(authError("profile_not_found", 404));
    const { POST } = await import("@/app/api/overlay/regenerate/route");
    const res = await POST();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
  });

  it("returns 403 when the caller is not registered on-chain", async () => {
    requireAuthedProfileMock.mockResolvedValue(
      authContext(
        {
          id: CREATOR_PROFILE_ID,
          user_id: USER_ID,
          handle: "ada",
          onchain_registered: false,
          paused: false,
        },
        serviceFrom,
      ),
    );
    const { POST } = await import("@/app/api/overlay/regenerate/route");
    const res = await POST();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_active" });
  });

  it("returns 403 when the caller is paused", async () => {
    requireAuthedProfileMock.mockResolvedValue(
      authContext(
        {
          id: CREATOR_PROFILE_ID,
          user_id: USER_ID,
          handle: "ada",
          onchain_registered: true,
          paused: true,
        },
        serviceFrom,
      ),
    );
    const { POST } = await import("@/app/api/overlay/regenerate/route");
    const res = await POST();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_active" });
  });

  it("generates a new overlay_id and updates the caller's profile", async () => {
    requireAuthedProfileMock.mockResolvedValue(activeProfileContext());
    const recorder = { payload: null as unknown, filter: null as unknown };
    serviceFrom.mockImplementation(() => updateChain(recorder));
    const { POST } = await import("@/app/api/overlay/regenerate/route");
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overlay_id).toMatch(/^[0-9a-f]{32}$/);
    expect(recorder.payload).toMatchObject({ overlay_id: body.overlay_id });
    expect(recorder.filter).toEqual({ c: "id", v: CREATOR_PROFILE_ID });
  });

  it("returns 500 db_error when the update fails", async () => {
    requireAuthedProfileMock.mockResolvedValue(activeProfileContext());
    const thenable = {
      eq: vi.fn(() => thenable),
      then: (onFulfilled?: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: null, error: { message: "dup" } }).then(
          onFulfilled as (v: unknown) => unknown,
        ),
    };
    serviceFrom.mockImplementation(() => ({
      update: vi.fn(() => thenable),
    }));
    const { POST } = await import("@/app/api/overlay/regenerate/route");
    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db_error" });
  });
});
