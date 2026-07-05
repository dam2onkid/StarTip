// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * lib/creators/public-profile — `getPublicProfile` HTTP contract.
 *
 * Reads the `public_profiles` view (which already filters
 * `onchain_registered = true AND paused = false`) by handle and returns the
 * public fields, or 404 when the handle is unknown / not registered / paused.
 *
 * Supabase is mocked with a fluent recorder so the test can assert on the
 * filter used (handle equality) and the returned shape.
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

  function respond(call: RecordedCall) {
    const r = responders[`${call.table}:${call.method}`];
    return r ? r(call) : { data: null, error: null };
  }
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
        payload: null,
        selectCols: state.selectCols,
      };
      calls.push(call);
      return Promise.resolve(respond(call));
    }
    return self;
  }

  const supabase = { from: vi.fn((table: string) => query(table)) };
  return { supabase, calls, setResponder };
}

function findCall(calls: RecordedCall[], table: string): RecordedCall | undefined {
  return calls.find((c) => c.table === table);
}

describe("getPublicProfile", () => {
  let mock: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mock = createMockSupabase();
  });

  it("returns the public fields for a registered, not-paused creator", async () => {
    mock.setResponder("public_profiles:select", () => ({
      data: {
        handle: "ada",
        display_name: "Ada Lovelace",
        avatar_url: "https://example.com/ada.png",
        bio: "Pioneer programmer.",
        onchain_registered: true,
      },
      error: null,
    }));
    const { getPublicProfile } = await import("@/lib/creators/public-profile");
    const result = await getPublicProfile(
      { service: mock.supabase as unknown as SupabaseClient },
      "ada",
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      handle: "ada",
      display_name: "Ada Lovelace",
      avatar_url: "https://example.com/ada.png",
      bio: "Pioneer programmer.",
      onchain_registered: true,
    });
    // The read is filtered by handle equality on the public_profiles view.
    const call = findCall(mock.calls, "public_profiles");
    expect(call).toBeDefined();
    expect(call?.filters).toEqual({ handle: "ada" });
  });

  it("returns 404 creator_not_found when the view returns no row (unknown handle)", async () => {
    mock.setResponder("public_profiles:select", () => ({ data: null, error: null }));
    const { getPublicProfile } = await import("@/lib/creators/public-profile");
    const result = await getPublicProfile(
      { service: mock.supabase as unknown as SupabaseClient },
      "ghost",
    );
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "creator_not_found" });
  });

  it("returns 404 creator_not_found when the creator is not registered (view excludes them)", async () => {
    // The public_profiles view already filters onchain_registered = true AND
    // paused = false, so a not-registered or paused creator simply does not
    // appear: the view returns null and the route reports 404.
    mock.setResponder("public_profiles:select", () => ({ data: null, error: null }));
    const { getPublicProfile } = await import("@/lib/creators/public-profile");
    const result = await getPublicProfile(
      { service: mock.supabase as unknown as SupabaseClient },
      "pending-creator",
    );
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "creator_not_found" });
  });

  it("returns 500 db_error when the query errors", async () => {
    mock.setResponder("public_profiles:select", () => ({
      data: null,
      error: { message: "boom" },
    }));
    const { getPublicProfile } = await import("@/lib/creators/public-profile");
    const result = await getPublicProfile(
      { service: mock.supabase as unknown as SupabaseClient },
      "ada",
    );
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "db_error" });
  });

  it("normalizes the handle to lowercase before filtering", async () => {
    mock.setResponder("public_profiles:select", () => ({
      data: {
        handle: "ada",
        display_name: "Ada",
        avatar_url: null,
        bio: null,
        onchain_registered: true,
      },
      error: null,
    }));
    const { getPublicProfile } = await import("@/lib/creators/public-profile");
    await getPublicProfile(
      { service: mock.supabase as unknown as SupabaseClient },
      "  Ada  ",
    );
    const call = findCall(mock.calls, "public_profiles");
    expect(call?.filters).toEqual({ handle: "ada" });
  });
});
