// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * goalProgress — pure aggregation of confirmed/indexed visible donations in
 * the goal's token into a `{ current, target, pct }` progress snapshot. Sums
 * the raw `amount` (numeric string, i128) with `BigInt` for the goal's token
 * only; `pct` is clamped to 0-100. Mirrors the `aggregateLeaderboard` /
 * `sumDonationStats` pattern in `leaderboard.ts`.
 */

describe("goalProgress", () => {
  it("sums raw amount for the goal's token only and computes pct", async () => {
    const { goalProgress } = await import("@/lib/creators/goal");
    const donations = [
      { token: "USDC", amount: "100" },
      { token: "USDC", amount: "250" },
      { token: "XLM", amount: "9999" }, // other token: ignored
    ];
    const result = goalProgress(donations, { token: "USDC", targetAmount: "1000" });
    expect(result.current).toBe("350");
    expect(result.target).toBe("1000");
    expect(result.pct).toBe(35);
  });

  it("handles zero donations (current = 0, pct = 0)", async () => {
    const { goalProgress } = await import("@/lib/creators/goal");
    const result = goalProgress([], { token: "USDC", targetAmount: "1000" });
    expect(result.current).toBe("0");
    expect(result.target).toBe("1000");
    expect(result.pct).toBe(0);
  });

  it("handles null/undefined donations (current = 0, pct = 0)", async () => {
    const { goalProgress } = await import("@/lib/creators/goal");
    const result = goalProgress(null, { token: "USDC", targetAmount: "1000" });
    expect(result.current).toBe("0");
    expect(result.pct).toBe(0);
  });

  it("clamps pct to 100 when current exceeds target", async () => {
    const { goalProgress } = await import("@/lib/creators/goal");
    const donations = [{ token: "USDC", amount: "1500" }];
    const result = goalProgress(donations, { token: "USDC", targetAmount: "1000" });
    expect(result.current).toBe("1500");
    expect(result.target).toBe("1000");
    expect(result.pct).toBe(100);
  });

  it("returns pct = 0 when target is 0 (avoids divide-by-zero)", async () => {
    const { goalProgress } = await import("@/lib/creators/goal");
    const donations = [{ token: "USDC", amount: "500" }];
    const result = goalProgress(donations, { token: "USDC", targetAmount: "0" });
    expect(result.current).toBe("500");
    expect(result.target).toBe("0");
    expect(result.pct).toBe(0);
  });

  it("handles arbitrary-precision i128 amounts via BigInt", async () => {
    const { goalProgress } = await import("@/lib/creators/goal");
    const big = "9".repeat(40); // exceeds Number.MAX_SAFE_INTEGER
    const donations = [
      { token: "USDC", amount: big },
      { token: "USDC", amount: "1" },
    ];
    const result = goalProgress(donations, { token: "USDC", targetAmount: "1" + "0".repeat(40) });
    // 40 nines + 1 = 1 followed by 40 zeros.
    expect(result.current).toBe("1" + "0".repeat(40));
    expect(result.pct).toBe(100);
  });

  it("skips rows whose amount is not a valid integer string", async () => {
    const { goalProgress } = await import("@/lib/creators/goal");
    const donations = [
      { token: "USDC", amount: "100" },
      { token: "USDC", amount: "not-a-number" },
    ];
    const result = goalProgress(donations, { token: "USDC", targetAmount: "1000" });
    expect(result.current).toBe("100");
    expect(result.pct).toBe(10);
  });

  it("rounds pct down to an integer (floor), not to nearest", async () => {
    const { goalProgress } = await import("@/lib/creators/goal");
    const donations = [{ token: "USDC", amount: "1" }];
    const result = goalProgress(donations, { token: "USDC", targetAmount: "3" });
    // 1/3 = 33.33... -> floor to 33.
    expect(result.pct).toBe(33);
  });
});
