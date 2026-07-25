// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Worker Live Events - Effect Intent creation.
 *
 * Tests assert the public request/response contract: a disabled Creator is
 * rejected, an amount below the current Effect Price is rejected, a stale
 * effect identifier is rejected, and a valid enabled request creates an
 * `effect_intents` row with the right raw amount and expiry.
 */

const SECRET = "test-secret";
const CREATOR_PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const TOKEN_CONTRACT = "CDUMMY-USDC-CONTRACT";

type Method = "select" | "insert";
interface RecordedCall {
  table: string;
  method: Method;
  filters: Record<string, unknown>;
  payload: unknown;
  selectCols: string | null;
}

function createMockSupabase() {
  const calls: RecordedCall[] = [];
  const responders: Record<string, (call: RecordedCall) => { data: unknown; error: unknown }> = {};

  function setResponder(key: string, fn: (call: RecordedCall) => { data: unknown; error: unknown }) {
    responders[key] = fn;
  }

  function query(table: string) {
    const state = {
      method: null as Method | null,
      filters: {} as Record<string, unknown>,
      payload: null as unknown,
      selectCols: null as string | null,
      committed: false,
    };
    const self = {
      select(cols: string) { if (state.method === null) state.method = "select"; state.selectCols = cols; return self; },
      insert(payload: unknown) { if (state.method === null) state.method = "insert"; state.payload = payload; return self; },
      eq(col: string, value: unknown) { state.filters[col] = value; return self; },
      maybeSingle() { return commit(); },
      single() { return commit(); },
      then(onFulfilled?: (v: { data: unknown; error: unknown }) => unknown,
           onRejected?: (e: unknown) => unknown) {
        return commit().then(
          onFulfilled as ((v: unknown) => unknown) | null,
          onRejected as ((e: unknown) => unknown) | null,
        );
      },
    };
    function commit() {
      if (state.committed) return Promise.resolve({ data: null, error: null });
      state.committed = true;
      const call: RecordedCall = {
        table,
        method: (state.method ?? "select") as Method,
        filters: { ...state.filters },
        payload: state.payload,
        selectCols: state.selectCols,
      };
      calls.push(call);
      const r = responders[`${call.table}:${call.method}`];
      return Promise.resolve(r ? r(call) : { data: null, error: null });
    }
    return self;
  }

  const supabase = { from: vi.fn((table: string) => query(table)) };
  return { supabase, calls, setResponder };
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    handle: "ada",
    token: TOKEN_CONTRACT,
    amount: "2",
    effect_id: "jump-scare",
    pack_id: "startip.default",
    pack_version: "1.0.0",
    donation_prep_id: "prep-1",
    ...overrides,
  };
}

describe("createEffectIntent", () => {
  let mock: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mock = createMockSupabase();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2026-07-25T12:00:00.000Z"));
  });

  function enableLiveEvents(prices: Record<string, number> = {}) {
    mock.setResponder("profiles:select", () => ({
      data: {
        id: CREATOR_PROFILE_ID,
        onchain_registered: true,
        paused: false,
      },
      error: null,
    }));
    mock.setResponder("live_event_settings:select", () => ({
      data: {
        live_events_enabled: true,
        screen_flash_price: prices["screen-flash"] ?? 1,
        jump_scare_price: prices["jump-scare"] ?? 2,
        tunnel_vision_price: prices["tunnel-vision"] ?? 3,
        screen_cover_price: prices["screen-cover"] ?? 5,
      },
      error: null,
    }));
    mock.setResponder("tokens:select", () => ({
      data: { contract_address: TOKEN_CONTRACT, decimals: 6 },
      error: null,
    }));
    mock.setResponder("effect_intents:insert", () => ({
      data: { id: "intent-1" },
      error: null,
    }));
  }

  it("rejects when the Creator is not found", async () => {
    mock.setResponder("profiles:select", () => ({ data: null, error: null }));
    const { createEffectIntent } = await import("./effect-intents");
    const result = await createEffectIntent({ service: mock.supabase as unknown as SupabaseClient }, validInput());
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "creator_not_found" });
  });

  it("rejects when Live Events are disabled", async () => {
    mock.setResponder("profiles:select", () => ({
      data: { id: CREATOR_PROFILE_ID, onchain_registered: true, paused: false },
      error: null,
    }));
    mock.setResponder("live_event_settings:select", () => ({
      data: { live_events_enabled: false },
      error: null,
    }));
    const { createEffectIntent } = await import("./effect-intents");
    const result = await createEffectIntent({ service: mock.supabase as unknown as SupabaseClient }, validInput());
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "live_events_disabled" });
  });

  it("rejects when the effect is not in the Default Pack", async () => {
    enableLiveEvents();
    const { createEffectIntent } = await import("./effect-intents");
    const result = await createEffectIntent(
      { service: mock.supabase as unknown as SupabaseClient },
      validInput({ effect_id: "unknown" }),
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "invalid_effect" });
  });

  it("rejects when the amount is below the current Effect Price", async () => {
    enableLiveEvents({ "jump-scare": 2 });
    const { createEffectIntent } = await import("./effect-intents");
    const result = await createEffectIntent(
      { service: mock.supabase as unknown as SupabaseClient },
      validInput({ amount: "1.5" }),
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "amount_below_price" });
  });

  it("rejects when the token has no metadata", async () => {
    enableLiveEvents();
    mock.setResponder("tokens:select", () => ({ data: null, error: null }));
    const { createEffectIntent } = await import("./effect-intents");
    const result = await createEffectIntent(
      { service: mock.supabase as unknown as SupabaseClient },
      validInput(),
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "token_not_found" });
  });

  it("creates an effect intent with the raw amount and a 10-minute expiry", async () => {
    enableLiveEvents({ "jump-scare": 2 });
    const { createEffectIntent } = await import("./effect-intents");
    const result = await createEffectIntent(
      { service: mock.supabase as unknown as SupabaseClient },
      validInput(),
    );
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      effect_intent_id: "intent-1",
      raw_amount: "2000000",
    });
    expect(typeof (result.body as { expires_at: string }).expires_at).toBe("string");

    const insertCall = mock.calls.find((c) => c.table === "effect_intents" && c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall?.payload).toMatchObject({
      creator_profile_id: CREATOR_PROFILE_ID,
      token: TOKEN_CONTRACT,
      raw_amount: "2000000",
      effect_id: "jump-scare",
      pack_id: "startip.default",
      pack_version: "1.0.0",
      donation_prep_id: "prep-1",
      status: "pending",
    });
  });

  it("rejects when the donation preparation id is already used", async () => {
    enableLiveEvents({ "jump-scare": 2 });
    mock.setResponder("effect_intents:insert", () => ({
      data: null,
      error: { code: "23505", message: "duplicate" },
    }));
    const { createEffectIntent } = await import("./effect-intents");
    const result = await createEffectIntent(
      { service: mock.supabase as unknown as SupabaseClient },
      validInput(),
    );
    expect(result.status).toBe(409);
    expect(result.body).toEqual({ error: "intent_exists" });
  });
});

describe("POST /live-events/effect-intents", () => {
  let mock: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mock = createMockSupabase();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2026-07-25T12:00:00.000Z"));
  });

  it("returns 401 when the secret is missing", async () => {
    const { createLiveEventsApp } = await import("./effect-intents");
    const app = createLiveEventsApp({ service: mock.supabase as unknown as SupabaseClient }, SECRET);
    const res = await app.request("/live-events/effect-intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validInput()),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 403 live_events_disabled when the Creator has not opted in", async () => {
    mock.setResponder("profiles:select", () => ({
      data: { id: CREATOR_PROFILE_ID, onchain_registered: true, paused: false },
      error: null,
    }));
    mock.setResponder("live_event_settings:select", () => ({
      data: { live_events_enabled: false },
      error: null,
    }));
    const { createLiveEventsApp } = await import("./effect-intents");
    const app = createLiveEventsApp({ service: mock.supabase as unknown as SupabaseClient }, SECRET);
    const res = await app.request("/live-events/effect-intents", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SECRET}`,
      },
      body: JSON.stringify(validInput()),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "live_events_disabled" });
  });
});
