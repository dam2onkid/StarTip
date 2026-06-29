// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * lib/creators/creator-stats — `loadCreatorDashboardData`.
 *
 * Loads the Creator's received donations via the creator RLS path
 * (`auth.uid() = profiles.user_id` join on `creator_profile_id`), which
 * exposes ALL columns including hidden donations and pending rows. Stats
 * (total + count) aggregate confirmed/indexed donations including hidden;
 * the per-creator leaderboard aggregates visible confirmed/indexed donations
 * with logged-in donors only (matching the public per-creator leaderboard).
 *
 * Supabase is mocked with a fluent recorder so the test asserts on the query
 * shape (table, selected columns, filter, order) and the derived stats.
 */

const CREATOR_PROFILE_ID = "00000000-0000-0000-0000-0000000000c1";

type Method = "select" | "insert" | "update" | "delete";
interface RecordedCall {
  table: string;
  method: Method;
  filters: Record<string, unknown>;
  selectCols: string | null;
  order: { column: string; ascending: boolean } | null;
}

function createMockSupabase(rows: Record<string, unknown>[]) {
  const calls: RecordedCall[] = [];
  function query(table: string) {
    const state = {
      method: null as Method | null,
      filters: {} as Record<string, unknown>,
      selectCols: null as string | null,
      order: null as { column: string; ascending: boolean } | null,
      committed: false,
    };
    const self = {
      select(cols: string) { state.method = "select"; state.selectCols = cols; return self; },
      insert() { state.method = "insert"; return self; },
      update() { state.method = "update"; return self; },
      delete() { state.method = "delete"; return self; },
      eq(col: string, value: unknown) { state.filters[col] = value; return self; },
      order(column: string, opts?: { ascending?: boolean }) {
        state.order = { column, ascending: opts?.ascending ?? true };
        return self;
      },
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
          selectCols: state.selectCols,
          order: state.order,
        };
        calls.push(call);
        return Promise.resolve({ data: rows, error: null }).then(
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

const ROWS = [
  {
    id: "d1",
    donor_name: "Ada",
    amount: "100",
    user_id: "u1",
    creator_profile_id: CREATOR_PROFILE_ID,
    token: "USDC",
    message: "Thank you!",
    donor_address: "G1",
    status: "confirmed",
    moderation_status: "visible",
    created_at: "2026-06-01T00:00:00Z",
  },
  {
    id: "d2",
    donor_name: "Bob",
    amount: "500",
    user_id: "u2",
    creator_profile_id: CREATOR_PROFILE_ID,
    token: "USDC",
    message: null,
    donor_address: "G2",
    status: "confirmed",
    moderation_status: "hidden",
    created_at: "2026-06-02T00:00:00Z",
  },
  {
    id: "d3",
    donor_name: "Anonymous",
    amount: "9999",
    user_id: null,
    creator_profile_id: CREATOR_PROFILE_ID,
    token: "USDC",
    message: null,
    donor_address: null,
    status: "confirmed",
    moderation_status: "visible",
    created_at: "2026-06-03T00:00:00Z",
  },
  {
    id: "d4",
    donor_name: "Fan",
    amount: "300",
    user_id: "u4",
    creator_profile_id: CREATOR_PROFILE_ID,
    token: "USDC",
    message: "Keep it up!",
    donor_address: "G4",
    status: "pending",
    moderation_status: "visible",
    created_at: "2026-06-04T00:00:00Z",
  },
];

describe("loadCreatorDashboardData", () => {
  it("queries donations via the creator RLS path filtered by creator_profile_id, ordered newest first", async () => {
    const { supabase, calls } = createMockSupabase(ROWS);
    const { loadCreatorDashboardData } = await import("@/lib/creators/creator-stats");
    await loadCreatorDashboardData(supabase, CREATOR_PROFILE_ID);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.table).toBe("donations");
    expect(call.method).toBe("select");
    expect(call.filters.creator_profile_id).toBe(CREATOR_PROFILE_ID);
    expect(call.order).toEqual({ column: "created_at", ascending: false });
    // The creator RLS path exposes all columns (including hidden + donor_address).
    expect(call.selectCols).toContain("moderation_status");
    expect(call.selectCols).toContain("donor_address");
    expect(call.selectCols).toContain("user_id");
  });

  it("stats total + count aggregate confirmed/indexed donations including hidden", async () => {
    const { supabase } = createMockSupabase(ROWS);
    const { loadCreatorDashboardData } = await import("@/lib/creators/creator-stats");
    const data = await loadCreatorDashboardData(supabase, CREATOR_PROFILE_ID);
    // confirmed rows: d1 (100 visible), d2 (500 hidden), d3 (9999 visible).
    // d4 is pending and excluded from stats. Hidden d2 IS counted.
    expect(data.stats.total).toBe("10599");
    expect(data.stats.count).toBe(3);
  });

  it("leaderboard aggregates visible confirmed/indexed donations with logged-in donors only", async () => {
    const { supabase } = createMockSupabase(ROWS);
    const { loadCreatorDashboardData } = await import("@/lib/creators/creator-stats");
    const data = await loadCreatorDashboardData(supabase, CREATOR_PROFILE_ID);
    // Visible confirmed: d1 (Ada 100, logged-in), d3 (Anonymous 9999, null user_id -> excluded).
    // d2 is hidden -> excluded from leaderboard. d4 is pending -> excluded.
    expect(data.leaderboard).toEqual([{ donor_name: "Ada", total_amount: "100" }]);
  });

  it("recent donations are the raw rows in the order returned (newest first), including hidden", async () => {
    const { supabase } = createMockSupabase(ROWS);
    const { loadCreatorDashboardData } = await import("@/lib/creators/creator-stats");
    const data = await loadCreatorDashboardData(supabase, CREATOR_PROFILE_ID);
    expect(data.recent.map((d) => d.id)).toEqual(["d1", "d2", "d3", "d4"]);
  });

  it("returns zero stats and empty leaderboard when there are no donations", async () => {
    const { supabase } = createMockSupabase([]);
    const { loadCreatorDashboardData } = await import("@/lib/creators/creator-stats");
    const data = await loadCreatorDashboardData(supabase, CREATOR_PROFILE_ID);
    expect(data.stats).toEqual({ total: "0", count: 0 });
    expect(data.leaderboard).toEqual([]);
    expect(data.recent).toEqual([]);
  });
});
