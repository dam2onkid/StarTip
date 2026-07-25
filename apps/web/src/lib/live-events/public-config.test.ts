// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * getLiveEventsPublicConfig — public read seam for the donate page and route.
 *
 * Returns the Creator's Live Events opt-in state and Default Pack prices. When
 * no row exists, Live Events are disabled and all prices fall back to the
 * shared defaults. Unknown / not registered / paused creators return 404.
 */

type Method = "select";
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
      selectCols: null as string | null,
      committed: false,
    };
    const self = {
      select(cols: string) { state.method = "select"; state.selectCols = cols; return self; },
      eq(col: string, value: unknown) { state.filters[col] = value; return self; },
      maybeSingle() { return commit(); },
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
        payload: null,
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

describe("getLiveEventsPublicConfig", () => {
  let mock: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mock = createMockSupabase();
  });

  it("returns defaults when no row exists for a registered creator", async () => {
    mock.setResponder("profiles:select", () => ({
      data: { id: "p1", onchain_registered: true, paused: false },
      error: null,
    }));
    mock.setResponder("live_event_settings:select", () => ({ data: null, error: null }));

    const { getLiveEventsPublicConfig } = await import("./public-config");
    const result = await getLiveEventsPublicConfig({ service: mock.supabase as unknown as SupabaseClient }, "ada");

    expect(result.status).toBe(200);
    const body = result.body as { live_events_enabled: boolean; effects: Record<string, { price: number }> };
    expect(body.live_events_enabled).toBe(false);
    expect(body.effects["screen-flash"].price).toBe(1);
    expect(body.effects["jump-scare"].price).toBe(2);
    expect(body.effects["tunnel-vision"].price).toBe(3);
    expect(body.effects["screen-cover"].price).toBe(5);
  });

  it("returns stored settings merged over defaults", async () => {
    mock.setResponder("profiles:select", () => ({
      data: { id: "p1", onchain_registered: true, paused: false },
      error: null,
    }));
    mock.setResponder("live_event_settings:select", () => ({
      data: {
        live_events_enabled: true,
        screen_flash_price: 3,
        jump_scare_price: null,
        tunnel_vision_price: 3,
        screen_cover_price: 5,
      },
      error: null,
    }));

    const { getLiveEventsPublicConfig } = await import("./public-config");
    const result = await getLiveEventsPublicConfig({ service: mock.supabase as unknown as SupabaseClient }, "ada");

    expect(result.status).toBe(200);
    const body = result.body as { live_events_enabled: boolean; effects: Record<string, { price: number }> };
    expect(body.live_events_enabled).toBe(true);
    expect(body.effects["screen-flash"].price).toBe(3);
    expect(body.effects["jump-scare"].price).toBe(2);
  });

  it("returns 404 when the creator is unknown / not registered / paused", async () => {
    mock.setResponder("profiles:select", () => ({ data: null, error: null }));
    const { getLiveEventsPublicConfig } = await import("./public-config");
    const result = await getLiveEventsPublicConfig({ service: mock.supabase as unknown as SupabaseClient }, "ghost");
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "creator_not_found" });
  });

  it("returns 500 db_error when the profile read errors", async () => {
    mock.setResponder("profiles:select", () => ({ data: null, error: { message: "boom" } }));
    const { getLiveEventsPublicConfig } = await import("./public-config");
    const result = await getLiveEventsPublicConfig({ service: mock.supabase as unknown as SupabaseClient }, "ada");
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "db_error" });
  });

  it("normalizes the handle to lowercase before filtering", async () => {
    mock.setResponder("profiles:select", () => ({
      data: { id: "p1", onchain_registered: true, paused: false },
      error: null,
    }));
    mock.setResponder("live_event_settings:select", () => ({ data: null, error: null }));
    const { getLiveEventsPublicConfig } = await import("./public-config");
    await getLiveEventsPublicConfig({ service: mock.supabase as unknown as SupabaseClient }, "  Ada  ");
    const call = mock.calls.find((c) => c.table === "profiles");
    expect(call?.filters).toEqual({ handle: "ada" });
  });
});
