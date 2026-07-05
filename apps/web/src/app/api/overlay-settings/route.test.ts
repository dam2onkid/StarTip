// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/overlay-settings — public GET (returns the Creator's settings row or
 * defaults) and authed PUT (upserts the caller's row via the browser RLS
 * path). Supabase is mocked; tests assert on status, body, and the
 * side-effect writes.
 */

const USER_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_ID = "00000000-0000-0000-0000-000000000002";
const CREATOR_PROFILE_ID = "11111111-1111-1111-1111-111111111111";

const getUser = vi.fn();
const serverFrom = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser },
    from: serverFrom,
  })),
}));

vi.mock("@startip/shared/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: serviceFrom })),
}));

/** A profiles select chain that resolves maybeSingle to `data`. */
function profilesSelectChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error }));
  return chain;
}

/** An overlay_settings select chain (service role GET path). */
function overlaySelectChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error }));
  return chain;
}

/** An upsert chain (session client PUT path) that records the payload. */
function upsertChain(recorder: { payload: unknown; error: unknown }) {
  const self = {
    select: vi.fn(() => self),
    eq: vi.fn(() => self),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    then: (onFulfilled?: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: null, error: recorder.error }).then(
        onFulfilled as ((v: unknown) => unknown) | null,
      ),
  };
  return {
    upsert: vi.fn((payload: unknown) => {
      recorder.payload = payload;
      return self;
    }),
  };
}

function getReq(handle: string) {
  return new NextRequest(
    `http://localhost/api/overlay-settings?handle=${encodeURIComponent(handle)}`,
    { method: "GET" },
  );
}

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/overlay-settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/overlay-settings", () => {
  beforeEach(() => {
    getUser.mockReset();
    serverFrom.mockReset();
    serviceFrom.mockReset();
  });

  it("returns 200 with the Creator's settings row when one exists", async () => {
    serviceFrom
      .mockImplementationOnce(() =>
        profilesSelectChain({
          id: CREATOR_PROFILE_ID,
          onchain_registered: true,
          paused: false,
        }),
      )
      .mockImplementationOnce(() =>
        overlaySelectChain({
          alert_duration_ms: 4000,
          min_amount: "5",
          sound_enabled: false,
          theme: "default",
        }),
      );
    const { GET } = await import("@/app/api/overlay-settings/route");
    const res = await GET(getReq("ada"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      alert_duration_ms: 4000,
      min_amount: "5",
      sound_enabled: false,
      theme: "default",
    });
  });

  it("returns 200 with defaults when no row exists", async () => {
    serviceFrom
      .mockImplementationOnce(() =>
        profilesSelectChain({
          id: CREATOR_PROFILE_ID,
          onchain_registered: true,
          paused: false,
        }),
      )
      .mockImplementationOnce(() => overlaySelectChain(null));
    const { GET } = await import("@/app/api/overlay-settings/route");
    const res = await GET(getReq("ada"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      alert_duration_ms: 6000,
      min_amount: "0",
      sound_enabled: true,
      theme: "default",
    });
  });

  it("returns 404 creator_not_found when the handle is unknown / not registered / paused", async () => {
    serviceFrom.mockImplementationOnce(() => profilesSelectChain(null));
    const { GET } = await import("@/app/api/overlay-settings/route");
    const res = await GET(getReq("ghost"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "creator_not_found" });
  });

  it("returns 400 missing_handle when no handle query is provided", async () => {
    const { GET } = await import("@/app/api/overlay-settings/route");
    const res = await GET(
      new NextRequest("http://localhost/api/overlay-settings", { method: "GET" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_handle" });
  });

  it("returns 500 db_error when the profile read errors", async () => {
    serviceFrom.mockImplementationOnce(() =>
      profilesSelectChain(null, { message: "boom" }),
    );
    const { GET } = await import("@/app/api/overlay-settings/route");
    const res = await GET(getReq("ada"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db_error" });
  });

  it("normalizes the handle to lowercase before filtering", async () => {
    serviceFrom
      .mockImplementationOnce(() =>
        profilesSelectChain({
          id: CREATOR_PROFILE_ID,
          onchain_registered: true,
          paused: false,
        }),
      )
      .mockImplementationOnce(() => overlaySelectChain(null));
    const { GET } = await import("@/app/api/overlay-settings/route");
    await GET(getReq("  Ada  "));
    const profileChain = serviceFrom.mock.results[0].value as {
      eq: { mock: { calls: unknown[][] } };
    };
    expect(profileChain.eq.mock.calls[0][1]).toBe("ada");
  });
});

describe("PUT /api/overlay-settings", () => {
  beforeEach(() => {
    getUser.mockReset();
    serverFrom.mockReset();
    serviceFrom.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { PUT } = await import("@/app/api/overlay-settings/route");
    const res = await PUT(putReq({ alert_duration_ms: 4000, min_amount: 5, sound_enabled: true }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 404 when the caller has no profile row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() => profilesSelectChain(null));
    const { PUT } = await import("@/app/api/overlay-settings/route");
    const res = await PUT(putReq({ alert_duration_ms: 4000, min_amount: 5, sound_enabled: true }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
  });

  it("returns 400 not_creator when the caller has no handle (not a Creator)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: null }),
    );
    const { PUT } = await import("@/app/api/overlay-settings/route");
    const res = await PUT(putReq({ alert_duration_ms: 4000, min_amount: 5, sound_enabled: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not_creator" });
  });

  it("returns 400 invalid_alert_duration when alert_duration_ms is out of range", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: "ada" }),
    );
    const { PUT } = await import("@/app/api/overlay-settings/route");
    const tooLow = await PUT(putReq({ alert_duration_ms: 500, min_amount: 0, sound_enabled: true }));
    expect(tooLow.status).toBe(400);
    expect(await tooLow.json()).toEqual({ error: "invalid_alert_duration" });
    const tooHigh = await PUT(putReq({ alert_duration_ms: 99999, min_amount: 0, sound_enabled: true }));
    expect(tooHigh.status).toBe(400);
    expect(await tooHigh.json()).toEqual({ error: "invalid_alert_duration" });
  });

  it("returns 400 invalid_min_amount when min_amount is negative", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: "ada" }),
    );
    const { PUT } = await import("@/app/api/overlay-settings/route");
    const res = await PUT(putReq({ alert_duration_ms: 4000, min_amount: -1, sound_enabled: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_min_amount" });
  });

  it("returns 400 invalid_sound_enabled when sound_enabled is not a boolean", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: "ada" }),
    );
    const { PUT } = await import("@/app/api/overlay-settings/route");
    const res = await PUT(putReq({ alert_duration_ms: 4000, min_amount: 0, sound_enabled: "yes" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_sound_enabled" });
  });

  it("returns 400 invalid_body when the body is not valid JSON", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const { PUT } = await import("@/app/api/overlay-settings/route");
    const res = await PUT(
      new NextRequest("http://localhost/api/overlay-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("upserts the caller's row via the session client (RLS owner write) and returns 200", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: "ada" }),
    );
    const recorder = { payload: null as unknown, error: null as unknown };
    // The PUT path uses the session client (serverFrom) for both the profile
    // read and the upsert; the second serverFrom call returns the upsert chain.
    serverFrom.mockImplementationOnce(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: "ada" }),
    );
    serverFrom.mockImplementationOnce(() => upsertChain(recorder));
    const { PUT } = await import("@/app/api/overlay-settings/route");
    const res = await PUT(putReq({ alert_duration_ms: 4000, min_amount: 5, sound_enabled: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      alert_duration_ms: 4000,
      min_amount: 5,
      sound_enabled: false,
    });
    // The upsert payload is scoped to the caller's profile id and carries the
    // validated fields.
    expect(recorder.payload).toMatchObject({
      creator_profile_id: CREATOR_PROFILE_ID,
      alert_duration_ms: 4000,
      min_amount: 5,
      sound_enabled: false,
    });
  });

  it("returns 500 db_error when the upsert errors (e.g. RLS denial surfaces as an error)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: OTHER_ID } }, error: null });
    serverFrom.mockImplementationOnce(() =>
      profilesSelectChain({ id: "22222222-2222-2222-2222-222222222222", user_id: OTHER_ID, handle: "bob" }),
    );
    const recorder = { payload: null as unknown, error: { message: "rls denied", code: "42501" } };
    serverFrom.mockImplementationOnce(() => upsertChain(recorder));
    const { PUT } = await import("@/app/api/overlay-settings/route");
    const res = await PUT(putReq({ alert_duration_ms: 4000, min_amount: 0, sound_enabled: true }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db_error" });
  });
});
