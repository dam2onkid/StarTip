// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/creators/[handle]/goal — public GET (returns the Creator's goal row or
 * null) and authed owner PUT (upserts the caller's row via the browser RLS
 * path; `target_amount = 0` deletes the row). Supabase is mocked; tests
 * assert on status, body, and the side-effect writes.
 */

const USER_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_ID = "00000000-0000-0000-0000-000000000002";
const CREATOR_PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_PROFILE_ID = "22222222-2222-2222-2222-222222222222";
const TOKEN_CONTRACT = "CDUMMY-USDC-CONTRACT";

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

/** A donation_goals select chain (service role GET path). */
function goalSelectChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error }));
  return chain;
}

/** A tokens select chain (service role allowlist read). */
function tokensSelectChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.data = data;
  chain.error = error;
  // The route uses `.then()` on the chain (PostgrestBuilder); provide it.
  chain.then = (onFulfilled?: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve({ data, error }).then(
      onFulfilled as ((v: unknown) => unknown) | null,
    );
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

/** A delete chain (session client clear-goal path) that records the filter. */
function deleteChain(recorder: { error: unknown; called: boolean }) {
  const self = {
    eq: vi.fn((_col: string, value: unknown) => {
      recorder.called = true;
      return self;
    }),
    then: (onFulfilled?: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: null, error: recorder.error }).then(
        onFulfilled as ((v: unknown) => unknown) | null,
      ),
  };
  return { delete: vi.fn(() => self) };
}

function getReq(handle: string) {
  return new NextRequest(
    `http://localhost/api/creators/${encodeURIComponent(handle)}/goal`,
    { method: "GET" },
  );
}

function putReq(handle: string, body: unknown) {
  return new NextRequest(
    `http://localhost/api/creators/${encodeURIComponent(handle)}/goal`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function ctx(handle: string) {
  return { params: Promise.resolve({ handle }) };
}

describe("GET /api/creators/[handle]/goal", () => {
  beforeEach(() => {
    getUser.mockReset();
    serverFrom.mockReset();
    serviceFrom.mockReset();
  });

  it("returns 200 with the goal row when one exists", async () => {
    serviceFrom
      .mockImplementationOnce(() =>
        profilesSelectChain({
          id: CREATOR_PROFILE_ID,
          onchain_registered: true,
          paused: false,
        }),
      )
      .mockImplementationOnce(() =>
        goalSelectChain({ target_amount: "1000", token: TOKEN_CONTRACT }),
      );
    const { GET } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await GET(getReq("ada"), ctx("ada"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ target_amount: "1000", token: TOKEN_CONTRACT });
  });

  it("returns 200 with null when no goal row exists", async () => {
    serviceFrom
      .mockImplementationOnce(() =>
        profilesSelectChain({
          id: CREATOR_PROFILE_ID,
          onchain_registered: true,
          paused: false,
        }),
      )
      .mockImplementationOnce(() => goalSelectChain(null));
    const { GET } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await GET(getReq("ada"), ctx("ada"));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("returns 404 creator_not_found when the handle is unknown / not registered / paused", async () => {
    serviceFrom.mockImplementationOnce(() => profilesSelectChain(null));
    const { GET } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await GET(getReq("ghost"), ctx("ghost"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "creator_not_found" });
  });

  it("returns 500 db_error when the profile read errors", async () => {
    serviceFrom.mockImplementationOnce(() =>
      profilesSelectChain(null, { message: "boom" }),
    );
    const { GET } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await GET(getReq("ada"), ctx("ada"));
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
      .mockImplementationOnce(() => goalSelectChain(null));
    const { GET } = await import("@/app/api/creators/[handle]/goal/route");
    await GET(getReq("Ada"), ctx("Ada"));
    const profileChain = serviceFrom.mock.results[0].value as {
      eq: { mock: { calls: unknown[][] } };
    };
    expect(profileChain.eq.mock.calls[0][1]).toBe("ada");
  });
});

describe("PUT /api/creators/[handle]/goal", () => {
  beforeEach(() => {
    getUser.mockReset();
    serverFrom.mockReset();
    serviceFrom.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { PUT } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await PUT(
      putReq("ada", { target_amount: 1000, token: TOKEN_CONTRACT }),
      ctx("ada"),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 404 when the caller has no profile row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() => profilesSelectChain(null));
    const { PUT } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await PUT(
      putReq("ada", { target_amount: 1000, token: TOKEN_CONTRACT }),
      ctx("ada"),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
  });

  it("returns 403 forbidden when the caller's handle does not match the path handle", async () => {
    getUser.mockResolvedValue({ data: { user: { id: OTHER_ID } }, error: null });
    // Caller is "bob" but the path is /api/creators/ada/goal.
    serverFrom.mockImplementation(() =>
      profilesSelectChain({ id: OTHER_PROFILE_ID, user_id: OTHER_ID, handle: "bob" }),
    );
    const { PUT } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await PUT(
      putReq("ada", { target_amount: 1000, token: TOKEN_CONTRACT }),
      ctx("ada"),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("returns 400 not_creator when the caller has no handle (not a Creator)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: null }),
    );
    const { PUT } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await PUT(
      putReq("ada", { target_amount: 1000, token: TOKEN_CONTRACT }),
      ctx("ada"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not_creator" });
  });

  it("returns 400 invalid_target when target_amount is negative", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: "ada" }),
    );
    const { PUT } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await PUT(
      putReq("ada", { target_amount: -1, token: TOKEN_CONTRACT }),
      ctx("ada"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_target" });
  });

  it("returns 400 invalid_token when token is missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: "ada" }),
    );
    const { PUT } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await PUT(putReq("ada", { target_amount: 1000, token: "" }), ctx("ada"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_token" });
  });

  it("returns 400 token_not_allowed when the token is not in the allowlist", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementation(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: "ada" }),
    );
    serviceFrom.mockImplementation(() =>
      tokensSelectChain([{ contract_address: TOKEN_CONTRACT }]),
    );
    const { PUT } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await PUT(
      putReq("ada", { target_amount: 1000, token: "C-UNKNOWN" }),
      ctx("ada"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "token_not_allowed" });
  });

  it("returns 400 invalid_body when the body is not valid JSON", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const { PUT } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await PUT(
      new NextRequest("http://localhost/api/creators/ada/goal", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
      ctx("ada"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("upserts the caller's row via the session client (RLS owner write) and returns 200", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    // 1. profiles read (session client) -> caller's profile
    // 2. tokens read (service client) -> allowlist contains the token
    // 3. upsert (session client)
    serverFrom.mockImplementationOnce(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: "ada" }),
    );
    serviceFrom.mockImplementationOnce(() =>
      tokensSelectChain([{ contract_address: TOKEN_CONTRACT }]),
    );
    const recorder = { payload: null as unknown, error: null as unknown };
    serverFrom.mockImplementationOnce(() => upsertChain(recorder));
    const { PUT } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await PUT(
      putReq("ada", { target_amount: 1000, token: TOKEN_CONTRACT }),
      ctx("ada"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ target_amount: 1000, token: TOKEN_CONTRACT });
    expect(recorder.payload).toMatchObject({
      creator_profile_id: CREATOR_PROFILE_ID,
      target_amount: 1000,
      token: TOKEN_CONTRACT,
    });
  });

  it("deletes the row when target_amount = 0 (clears the goal) and returns 200", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    serverFrom.mockImplementationOnce(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: "ada" }),
    );
    // The clear path does not need the token to be in the allowlist (no
    // upsert), but the route still validates the token shape; pass a valid one.
    serviceFrom.mockImplementationOnce(() =>
      tokensSelectChain([{ contract_address: TOKEN_CONTRACT }]),
    );
    const recorder = { error: null as unknown, called: false };
    serverFrom.mockImplementationOnce(() => deleteChain(recorder));
    const { PUT } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await PUT(
      putReq("ada", { target_amount: 0, token: TOKEN_CONTRACT }),
      ctx("ada"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ target_amount: 0, token: TOKEN_CONTRACT });
    expect(recorder.called).toBe(true);
  });

  it("returns 500 db_error when the upsert errors (e.g. RLS denial surfaces as an error)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: OTHER_ID } }, error: null });
    // Caller is "ada" (matches path) but RLS denies the write (e.g. the
    // profiles.user_id join does not match because the row was seeded by the
    // service role). The route surfaces the RLS error as 500 db_error.
    serverFrom.mockImplementationOnce(() =>
      profilesSelectChain({ id: CREATOR_PROFILE_ID, user_id: OTHER_ID, handle: "ada" }),
    );
    serviceFrom.mockImplementationOnce(() =>
      tokensSelectChain([{ contract_address: TOKEN_CONTRACT }]),
    );
    const recorder = { payload: null as unknown, error: { message: "rls denied", code: "42501" } };
    serverFrom.mockImplementationOnce(() => upsertChain(recorder));
    const { PUT } = await import("@/app/api/creators/[handle]/goal/route");
    const res = await PUT(
      putReq("ada", { target_amount: 1000, token: TOKEN_CONTRACT }),
      ctx("ada"),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db_error" });
  });
});
