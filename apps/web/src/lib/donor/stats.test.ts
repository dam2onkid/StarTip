// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * computeDonorRank — pure computation of a logged-in donor's rank and total
 * donated amount from a set of donation rows. Anonymous donations (user_id
 * null) are excluded so the donor's privacy is preserved and only tracked
 * donations count toward leaderboards (PRD user stories 33-34).
 *
 * Rank is 1-based: the number of donors with a strictly greater total, plus
 * one. Returns `rank: null` when the user has no tracked donations.
 */

describe("computeDonorRank", () => {
  it("returns the donor's 1-based rank and total, ranked by total descending", async () => {
    const { computeDonorRank } = await import("@/lib/donor/stats");
    const rows = [
      { donor_name: "Ada", amount: "100", user_id: "u1" },
      { donor_name: "Bob", amount: "500", user_id: "u2" },
      { donor_name: "Ada", amount: "250", user_id: "u1" },
    ];
    const result = computeDonorRank(rows, "u1");
    expect(result.rank).toBe(2);
    expect(result.total).toBe("350");
  });

  it("excludes anonymous donations (user_id null) from rank and totals", async () => {
    const { computeDonorRank } = await import("@/lib/donor/stats");
    const rows = [
      { donor_name: "Ada", amount: "100", user_id: "u1" },
      { donor_name: "Anonymous", amount: "9999", user_id: null },
      { donor_name: "Bob", amount: "50", user_id: "u2" },
    ];
    const result = computeDonorRank(rows, "u1");
    expect(result.rank).toBe(1);
    expect(result.total).toBe("100");
  });

  it("returns rank null and total 0 when the user has no tracked donations", async () => {
    const { computeDonorRank } = await import("@/lib/donor/stats");
    const rows = [
      { donor_name: "Bob", amount: "50", user_id: "u2" },
      { donor_name: "Anonymous", amount: "9999", user_id: null },
    ];
    const result = computeDonorRank(rows, "u1");
    expect(result.rank).toBeNull();
    expect(result.total).toBe("0");
  });

  it("handles arbitrary-precision i128 amounts via BigInt", async () => {
    const { computeDonorRank } = await import("@/lib/donor/stats");
    const big = "9".repeat(40); // exceeds Number.MAX_SAFE_INTEGER
    const rows = [
      { donor_name: "Ada", amount: big, user_id: "u1" },
      { donor_name: "Ada", amount: "1", user_id: "u1" },
      { donor_name: "Bob", amount: "1", user_id: "u2" },
    ];
    const result = computeDonorRank(rows, "u1");
    expect(result.rank).toBe(1);
    // 40 nines + 1 = 1 followed by 40 zeros.
    expect(result.total).toBe("1" + "0".repeat(40));
  });

  it("assigns tied donors the same rank (competition ranking)", async () => {
    const { computeDonorRank } = await import("@/lib/donor/stats");
    const rows = [
      { donor_name: "Ada", amount: "100", user_id: "u1" },
      { donor_name: "Bob", amount: "100", user_id: "u2" },
      { donor_name: "Cleo", amount: "50", user_id: "u3" },
    ];
    const result = computeDonorRank(rows, "u1");
    // Ada and Bob tie at 100; both are rank 1. Cleo is rank 3.
    expect(result.rank).toBe(1);
  });

  it("returns rank null for an empty row set", async () => {
    const { computeDonorRank } = await import("@/lib/donor/stats");
    const result = computeDonorRank([], "u1");
    expect(result.rank).toBeNull();
    expect(result.total).toBe("0");
  });
});
