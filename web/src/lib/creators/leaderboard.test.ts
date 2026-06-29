// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * aggregateLeaderboard — pure aggregation of confirmed/indexed visible
 * donations into a ranked donor leaderboard. Only donations with a non-null
 * `user_id` (logged-in donors) contribute; anonymous donations are excluded.
 * Sums the raw `amount` (numeric string, i128) per donor_name, sorts
 * descending, and returns the top entries.
 */

describe("aggregateLeaderboard", () => {
  it("ranks by total descending so the largest donor is first", async () => {
    const { aggregateLeaderboard } = await import("@/lib/creators/leaderboard");
    const rows = [
      { donor_name: "Ada", amount: "100", user_id: "u1" },
      { donor_name: "Bob", amount: "500", user_id: "u2" },
      { donor_name: "Ada", amount: "250", user_id: "u1" },
    ];
    const result = aggregateLeaderboard(rows);
    expect(result[0].donor_name).toBe("Bob");
    expect(result[0].total_amount).toBe("500");
    expect(result[1].donor_name).toBe("Ada");
    expect(result[1].total_amount).toBe("350");
  });

  it("excludes anonymous donations (user_id is null)", async () => {
    const { aggregateLeaderboard } = await import("@/lib/creators/leaderboard");
    const rows = [
      { donor_name: "Ada", amount: "100", user_id: "u1" },
      { donor_name: "Anonymous", amount: "9999", user_id: null },
      { donor_name: "Bob", amount: "50", user_id: "u2" },
    ];
    const result = aggregateLeaderboard(rows);
    expect(result.find((e) => e.donor_name === "Anonymous")).toBeUndefined();
    expect(result).toHaveLength(2);
  });

  it("handles arbitrary-precision i128 amounts via BigInt", async () => {
    const { aggregateLeaderboard } = await import("@/lib/creators/leaderboard");
    const big = "9".repeat(40); // exceeds Number.MAX_SAFE_INTEGER
    const rows = [
      { donor_name: "Ada", amount: big, user_id: "u1" },
      { donor_name: "Ada", amount: "1", user_id: "u1" },
    ];
    const result = aggregateLeaderboard(rows);
    // 40 nines + 1 = 1 followed by 40 zeros.
    expect(result[0].total_amount).toBe("1" + "0".repeat(40));
  });

  it("returns an empty array when given no rows", async () => {
    const { aggregateLeaderboard } = await import("@/lib/creators/leaderboard");
    expect(aggregateLeaderboard([])).toEqual([]);
    expect(aggregateLeaderboard(null as unknown as never[])).toEqual([]);
  });

  it("limits to the requested top count", async () => {
    const { aggregateLeaderboard } = await import("@/lib/creators/leaderboard");
    const rows = [
      { donor_name: "A", amount: "10", user_id: "u1" },
      { donor_name: "B", amount: "20", user_id: "u2" },
      { donor_name: "C", amount: "30", user_id: "u3" },
    ];
    const result = aggregateLeaderboard(rows, 2);
    expect(result).toHaveLength(2);
    expect(result[0].donor_name).toBe("C");
    expect(result[1].donor_name).toBe("B");
  });

  it("breaks ties by donor_name ascending for a stable order", async () => {
    const { aggregateLeaderboard } = await import("@/lib/creators/leaderboard");
    const rows = [
      { donor_name: "Zoe", amount: "100", user_id: "u1" },
      { donor_name: "Ada", amount: "100", user_id: "u2" },
    ];
    const result = aggregateLeaderboard(rows);
    expect(result[0].donor_name).toBe("Ada");
    expect(result[1].donor_name).toBe("Zoe");
  });
});
