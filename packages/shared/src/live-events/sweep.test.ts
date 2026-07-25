// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sweepExpiredLiveEvents } from "./sweep";

/**
 * Live Event expiry sweep tests.
 *
 * These tests assert that the sweep updates only queued events whose deadline
 * has passed, leaving started or later events untouched.
 */

type Method = "update" | "select" | "lt" | "eq";
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
      ltValue: null as unknown,
    };
    const self = {
      select(cols: string) { if (state.method === null) state.method = "select"; state.selectCols = cols; return self; },
      update(payload: unknown) { state.method = "update"; state.payload = payload; return self; },
      eq(col: string, value: unknown) { state.filters[col] = value; return self; },
      lt(col: string, value: unknown) { state.ltValue = { col, value }; return self; },
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
        filters: { ...state.filters, ...(state.ltValue ? { lt: state.ltValue } : {}) },
        payload: state.payload,
        selectCols: state.selectCols,
      };
      calls.push(call);
      const key = state.ltValue ? `${table}:${call.method}:lt` : `${table}:${call.method}`;
      const r = responders[key] ?? responders[`${table}:${call.method}`];
      return Promise.resolve(r ? r(call) : { data: null, error: null });
    }
    return self;
  }

  const supabase = { from: vi.fn((table: string) => query(table)) };
  return { supabase, calls, setResponder };
}

const BEFORE = "2026-07-25T12:01:00.000Z";

describe("sweepExpiredLiveEvents", () => {
  let mock: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mock = createMockSupabase();
  });

  it("updates queued events whose expires_at is before the cutoff", async () => {
    mock.setResponder("live_events:update:lt", () => ({
      data: [{ id: "le-1" }, { id: "le-2" }],
      error: null,
    }));

    const result = await sweepExpiredLiveEvents(
      mock.supabase as unknown as SupabaseClient,
      BEFORE,
    );

    expect(result.error).toBeNull();
    expect(result.updated).toBe(2);

    const call = mock.calls.find((c) => c.table === "live_events" && c.method === "update");
    expect(call).toBeDefined();
    expect(call!.payload).toMatchObject({ status: "missed" });
    expect((call!.payload as Record<string, unknown>).ack_terminal_at).toBe(BEFORE);
    expect(call!.filters).toMatchObject({ status: "queued", lt: { col: "expires_at", value: BEFORE } });
  });

  it("returns an error when the update fails", async () => {
    mock.setResponder("live_events:update:lt", () => ({
      data: null,
      error: { message: "db_down" },
    }));

    const result = await sweepExpiredLiveEvents(
      mock.supabase as unknown as SupabaseClient,
      BEFORE,
    );

    expect(result.error).toBe("db_down");
    expect(result.updated).toBe(0);
  });
});
