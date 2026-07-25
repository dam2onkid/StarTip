// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { authError, authContext } from "@/lib/auth/test-helpers";

/**
 * /api/creators/[handle]/live-events - public GET (returns the Creator's Live
 * Events configuration and Default Pack effect prices) and authed owner PUT
 * (upserts the caller's row). Tests cover public read, owner write, ownership
 * isolation, price validation at the platform floor, and default price filling.
 */

const USER_ID = "00000000-0000-0000-0000-000000000001";
const CREATOR_PROFILE_ID = "11111111-1111-1111-1111-111111111111";

const requireAuthedCreatorMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/context", () => ({
  requireAuthedCreator: requireAuthedCreatorMock,
}));

const serverFrom = vi.fn();
const serviceFrom = vi.fn();
vi.mock("@startip/shared/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: serviceFrom })),
}));

function profilesSelectChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error }));
  return chain;
}

function liveEventSelectChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error }));
  return chain;
}

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
    `http://localhost/api/creators/${encodeURIComponent(handle)}/live-events`,
    { method: "GET" },
  );
}

function putReq(handle: string, body: unknown) {
  return new NextRequest(
    `http://localhost/api/creators/${encodeURIComponent(handle)}/live-events`,
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

describe("GET /api/creators/[handle]/live-events", () => {
  beforeEach(() => {
    serviceFrom.mockReset();
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
      .mockImplementationOnce(() => liveEventSelectChain(null));
    const { GET } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await GET(getReq("ada"), ctx("ada"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      live_events_enabled: boolean;
      effects: Record<string, { name: string; price: number }>;
    };
    expect(body.live_events_enabled).toBe(false);
    expect(body.effects["screen-flash"].price).toBe(1);
    expect(body.effects["jump-scare"].price).toBe(2);
    expect(body.effects["tunnel-vision"].price).toBe(3);
    expect(body.effects["screen-cover"].price).toBe(5);
  });

  it("returns 200 with stored settings merged over defaults", async () => {
    serviceFrom
      .mockImplementationOnce(() =>
        profilesSelectChain({
          id: CREATOR_PROFILE_ID,
          onchain_registered: true,
          paused: false,
        }),
      )
      .mockImplementationOnce(() =>
        liveEventSelectChain({
          live_events_enabled: true,
          screen_flash_price: 3,
          jump_scare_price: 4,
          tunnel_vision_price: 6,
          screen_cover_price: 10,
        }),
      );
    const { GET } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await GET(getReq("ada"), ctx("ada"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      live_events_enabled: boolean;
      effects: Record<string, { name: string; price: number }>;
    };
    expect(body.live_events_enabled).toBe(true);
    expect(body.effects["screen-flash"].price).toBe(3);
    expect(body.effects["jump-scare"].price).toBe(4);
    expect(body.effects["tunnel-vision"].price).toBe(6);
    expect(body.effects["screen-cover"].price).toBe(10);
  });

  it("returns 404 creator_not_found when the handle is unknown / not registered / paused", async () => {
    serviceFrom.mockImplementationOnce(() => profilesSelectChain(null));
    const { GET } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await GET(getReq("ghost"), ctx("ghost"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "creator_not_found" });
  });

  it("returns 500 db_error when the profile read errors", async () => {
    serviceFrom.mockImplementationOnce(() =>
      profilesSelectChain(null, { message: "boom" }),
    );
    const { GET } = await import("@/app/api/creators/[handle]/live-events/route");
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
      .mockImplementationOnce(() => liveEventSelectChain(null));
    const { GET } = await import("@/app/api/creators/[handle]/live-events/route");
    await GET(getReq("Ada"), ctx("Ada"));
    const profileChain = serviceFrom.mock.results[0].value as {
      eq: { mock: { calls: unknown[][] } };
    };
    expect(profileChain.eq.mock.calls[0][1]).toBe("ada");
  });
});

describe("PUT /api/creators/[handle]/live-events", () => {
  beforeEach(() => {
    requireAuthedCreatorMock.mockReset();
    serverFrom.mockReset();
    serviceFrom.mockReset();
    requireAuthedCreatorMock.mockResolvedValue(
      authContext({ id: CREATOR_PROFILE_ID, user_id: USER_ID, handle: "ada" }, serverFrom),
    );
  });

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      live_events_enabled: true,
      prices: {
        "screen-flash": 1,
        "jump-scare": 2,
        "tunnel-vision": 3,
        "screen-cover": 5,
      },
      ...overrides,
    };
  }

  it("returns 401 when there is no session", async () => {
    requireAuthedCreatorMock.mockResolvedValue(authError("unauthorized", 401));
    const { PUT } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await PUT(putReq("ada", validBody()), ctx("ada"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 404 when the caller has no profile row", async () => {
    requireAuthedCreatorMock.mockResolvedValue(authError("profile_not_found", 404));
    const { PUT } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await PUT(putReq("ada", validBody()), ctx("ada"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
  });

  it("returns 403 forbidden when the caller's handle does not match the path handle", async () => {
    requireAuthedCreatorMock.mockResolvedValue(authError("forbidden", 403));
    const { PUT } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await PUT(putReq("ada", validBody()), ctx("ada"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("returns 400 not_creator when the caller has no handle", async () => {
    requireAuthedCreatorMock.mockResolvedValue(authError("not_creator", 400));
    const { PUT } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await PUT(putReq("ada", validBody()), ctx("ada"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not_creator" });
  });

  it("returns 400 invalid_body when the body is not valid JSON", async () => {
    const { PUT } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await PUT(
      new NextRequest("http://localhost/api/creators/ada/live-events", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
      ctx("ada"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 400 invalid_live_events_enabled when the toggle is not a boolean", async () => {
    const { PUT } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await PUT(
      putReq("ada", validBody({ live_events_enabled: "yes" })),
      ctx("ada"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_live_events_enabled" });
  });

  it("returns 400 invalid_prices when prices is not an object", async () => {
    const { PUT } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await PUT(putReq("ada", validBody({ prices: "free" })), ctx("ada"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_prices" });
  });

  it("returns 400 price_below_floor when a Creator-edited price is below 0.10", async () => {
    const { PUT } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await PUT(
      putReq(
        "ada",
        validBody({ prices: { "screen-flash": 0.05, "jump-scare": 2, "tunnel-vision": 3, "screen-cover": 5 } }),
      ),
      ctx("ada"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "price_below_floor" });
  });

  it("returns 400 invalid_price for a non-numeric price", async () => {
    const { PUT } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await PUT(
      putReq(
        "ada",
        validBody({ prices: { "screen-flash": "cheap", "jump-scare": 2, "tunnel-vision": 3, "screen-cover": 5 } }),
      ),
      ctx("ada"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_price" });
  });

  it("upserts the caller's row via the session client (RLS owner write) and returns 200", async () => {
    const recorder = { payload: null as unknown, error: null as unknown };
    serverFrom.mockImplementation(() => upsertChain(recorder));
    const { PUT } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await PUT(putReq("ada", validBody()), ctx("ada"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      live_events_enabled: boolean;
      prices: Record<string, number>;
    };
    expect(body.live_events_enabled).toBe(true);
    expect(body.prices["screen-flash"]).toBe(1);
    expect(recorder.payload).toMatchObject({
      creator_profile_id: CREATOR_PROFILE_ID,
      live_events_enabled: true,
      screen_flash_price: 1,
      jump_scare_price: 2,
      tunnel_vision_price: 3,
      screen_cover_price: 5,
    });
  });

  it("returns 500 db_error when the upsert errors", async () => {
    const recorder = { payload: null as unknown, error: { message: "rls denied", code: "42501" } };
    serverFrom.mockImplementation(() => upsertChain(recorder));
    const { PUT } = await import("@/app/api/creators/[handle]/live-events/route");
    const res = await PUT(putReq("ada", validBody()), ctx("ada"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db_error" });
  });
});
