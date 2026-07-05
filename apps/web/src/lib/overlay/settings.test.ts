// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * lib/overlay/settings — pure, client-safe helpers for the Overlay.
 *
 * `shouldShowAlert` suppresses donations whose raw `amount` is below the
 * Creator's `min_amount` (already converted to raw units by the server
 * component, so the client never needs a per-alert decimals lookup).
 * `alertDurationMs` returns the configured alert duration or the 6000ms
 * default when the field is missing/invalid.
 */

describe("shouldShowAlert", () => {
  it("returns true when amount equals min_amount (boundary is inclusive)", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(
      shouldShowAlert(
        { amount: "1000" },
        { minAmountRaw: "1000" },
      ),
    ).toBe(true);
  });

  it("returns true when amount is above min_amount", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(
      shouldShowAlert(
        { amount: "5000" },
        { minAmountRaw: "1000" },
      ),
    ).toBe(true);
  });

  it("returns false when amount is below min_amount (raw units)", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(
      shouldShowAlert(
        { amount: "999" },
        { minAmountRaw: "1000" },
      ),
    ).toBe(false);
  });

  it("returns true when min_amount is 0 (no threshold)", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(
      shouldShowAlert({ amount: "1" }, { minAmountRaw: "0" }),
    ).toBe(true);
  });

  it("treats a missing minAmountRaw as 0 (no threshold)", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(shouldShowAlert({ amount: "1" }, {})).toBe(true);
  });

  it("handles arbitrary-precision i128 amounts via BigInt", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    const big = "9".repeat(40); // exceeds Number.MAX_SAFE_INTEGER
    expect(
      shouldShowAlert(
        { amount: big },
        { minAmountRaw: "1" + "0".repeat(40) },
      ),
    ).toBe(false);
    expect(
      shouldShowAlert(
        { amount: "2" + "0".repeat(40) },
        { minAmountRaw: "1" + "0".repeat(40) },
      ),
    ).toBe(true);
  });

  it("returns true when amount is non-numeric (defensive: never suppress a real alert)", async () => {
    const { shouldShowAlert } = await import("@/lib/overlay/settings");
    expect(
      shouldShowAlert({ amount: "not-a-number" }, { minAmountRaw: "0" }),
    ).toBe(true);
  });
});

describe("alertDurationMs", () => {
  it("returns the configured duration when set", async () => {
    const { alertDurationMs } = await import("@/lib/overlay/settings");
    expect(alertDurationMs({ alertDurationMs: 4000 })).toBe(4000);
  });

  it("returns the 6000 default when the field is missing", async () => {
    const { alertDurationMs } = await import("@/lib/overlay/settings");
    expect(alertDurationMs({})).toBe(6000);
  });

  it("returns the 6000 default when the field is not a finite number", async () => {
    const { alertDurationMs } = await import("@/lib/overlay/settings");
    expect(alertDurationMs({ alertDurationMs: NaN })).toBe(6000);
    expect(alertDurationMs({ alertDurationMs: Infinity })).toBe(6000);
    expect(alertDurationMs({ alertDurationMs: "6000" as unknown as number })).toBe(6000);
  });

  it("clamps a sub-1000 value up to the 1000 floor", async () => {
    const { alertDurationMs } = await import("@/lib/overlay/settings");
    expect(alertDurationMs({ alertDurationMs: 500 })).toBe(1000);
  });

  it("clamps a super-60000 value down to the 60000 ceiling", async () => {
    const { alertDurationMs } = await import("@/lib/overlay/settings");
    expect(alertDurationMs({ alertDurationMs: 99999 })).toBe(60000);
  });
});
