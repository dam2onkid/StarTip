// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * lib/creators/moderation — `updateDonationModerationStatus`.
 *
 * The Creator toggles a donation's `moderation_status` between `visible` and
 * `hidden` from the dashboard Creator tab. The update goes through the browser
 * Supabase client so the `donations_creator_moderation_update` RLS policy
 * (`auth.uid() = profiles.user_id` join on `creator_profile_id`) and the
 * column-level GRANT (only `moderation_status` is writable) apply directly
 * from the browser. The service role is never involved.
 *
 * Supabase is mocked with a fluent recorder so the test asserts on the PATCH
 * shape (table, update body, eq filter).
 */

type Method = "select" | "insert" | "update" | "delete";
interface RecordedCall {
  table: string;
  method: Method;
  filters: Record<string, unknown>;
  payload: unknown;
}

function createMockSupabase(success: boolean) {
  const calls: RecordedCall[] = [];
  function query(table: string) {
    const state = {
      method: null as Method | null,
      filters: {} as Record<string, unknown>,
      payload: null as unknown,
      committed: false,
    };
    const self = {
      select() { state.method = "select"; return self; },
      insert() { state.method = "insert"; return self; },
      update(payload: unknown) { state.method = "update"; state.payload = payload; return self; },
      delete() { state.method = "delete"; return self; },
      eq(col: string, value: unknown) { state.filters[col] = value; return self; },
      then(onFulfilled?: (v: { data: unknown; error: unknown }) => unknown,
           onRejected?: (e: unknown) => unknown) {
        if (state.committed) return Promise.resolve({ data: null, error: null }).then(
          onFulfilled as ((v: unknown) => unknown) | null,
          onRejected as ((e: unknown) => unknown) | null,
        );
        state.committed = true;
        const call: RecordedCall = {
          table,
          method: (state.method ?? "select") as Method,
          filters: { ...state.filters },
          payload: state.payload,
        };
        calls.push(call);
        return Promise.resolve({
          data: success ? [{}] : null,
          error: success ? null : { message: "rls denied" },
        }).then(
          onFulfilled as ((v: unknown) => unknown) | null,
          onRejected as ((e: unknown) => unknown) | null,
        );
      },
    };
    return self;
  }
  const supabase = { from: vi.fn((table: string) => query(table)) } as unknown as SupabaseClient;
  return { supabase, calls };
}

describe("updateDonationModerationStatus", () => {
  it("PATCHes the donations table setting moderation_status filtered by id", async () => {
    const { supabase, calls } = createMockSupabase(true);
    const { updateDonationModerationStatus } = await import("@/lib/creators/moderation");
    const res = await updateDonationModerationStatus(supabase, "d1", "hidden");
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.table).toBe("donations");
    expect(call.method).toBe("update");
    expect(call.payload).toEqual({ moderation_status: "hidden" });
    expect(call.filters.id).toBe("d1");
  });

  it("returns ok=true when setting visible", async () => {
    const { supabase } = createMockSupabase(true);
    const { updateDonationModerationStatus } = await import("@/lib/creators/moderation");
    const res = await updateDonationModerationStatus(supabase, "d2", "visible");
    expect(res.ok).toBe(true);
  });

  it("returns ok=false with the error message when the PATCH is denied", async () => {
    const { supabase } = createMockSupabase(false);
    const { updateDonationModerationStatus } = await import("@/lib/creators/moderation");
    const res = await updateDonationModerationStatus(supabase, "d3", "hidden");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("rls denied");
  });

  it("rejects an invalid moderation status", async () => {
    const { supabase } = createMockSupabase(true);
    const { updateDonationModerationStatus } = await import("@/lib/creators/moderation");
    const res = await updateDonationModerationStatus(
      supabase,
      "d4",
      "deleted" as "visible" | "hidden",
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/invalid/i);
  });
});
