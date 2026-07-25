// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Shared Live Events pricing contract.
 *
 * The Default Pack supplies initial Effect Prices and a shared platform floor.
 * These tests assert default prices, price validation at the platform floor,
 * and the helper that resolves a Creator's stored prices back to defaults when
 * a value is missing.
 */

describe("default pack prices", () => {
  it("exposes the four Default Pack effect identifiers in a stable order", async () => {
    const { DEFAULT_EFFECT_IDS } = await import("./pricing");
    expect(DEFAULT_EFFECT_IDS).toEqual([
      "screen-flash",
      "jump-scare",
      "tunnel-vision",
      "screen-cover",
    ]);
  });

  it("sets initial prices to 1, 2, 3 and 5 test USDC respectively", async () => {
    const { DEFAULT_PACK_PRICES } = await import("./pricing");
    expect(DEFAULT_PACK_PRICES["screen-flash"]).toBe(1);
    expect(DEFAULT_PACK_PRICES["jump-scare"]).toBe(2);
    expect(DEFAULT_PACK_PRICES["tunnel-vision"]).toBe(3);
    expect(DEFAULT_PACK_PRICES["screen-cover"]).toBe(5);
  });

  it("defines a 0.10 test USDC platform floor", async () => {
    const { PLATFORM_FLOOR_USDC } = await import("./pricing");
    expect(PLATFORM_FLOOR_USDC).toBe(0.1);
  });
});

describe("validateEffectPrice", () => {
  it("accepts prices at or above the platform floor", async () => {
    const { validateEffectPrice, PLATFORM_FLOOR_USDC } = await import("./pricing");
    expect(validateEffectPrice(PLATFORM_FLOOR_USDC)).toEqual({ ok: true });
    expect(validateEffectPrice(1)).toEqual({ ok: true });
    expect(validateEffectPrice(5)).toEqual({ ok: true });
  });

  it("rejects prices below the platform floor", async () => {
    const { validateEffectPrice, PLATFORM_FLOOR_USDC } = await import("./pricing");
    expect(validateEffectPrice(0.09)).toEqual({ ok: false, error: "price_below_floor" });
    expect(validateEffectPrice(0)).toEqual({ ok: false, error: "price_below_floor" });
    expect(validateEffectPrice(-1)).toEqual({ ok: false, error: "price_below_floor" });
  });

  it("rejects non-finite or non-numeric values", async () => {
    const { validateEffectPrice } = await import("./pricing");
    expect(validateEffectPrice(NaN)).toEqual({ ok: false, error: "invalid_price" });
    expect(validateEffectPrice(Infinity)).toEqual({ ok: false, error: "invalid_price" });
    expect(validateEffectPrice("1" as unknown as number)).toEqual({ ok: false, error: "invalid_price" });
  });
});

describe("parsePriceInput", () => {
  it("parses string and numeric inputs to a finite number", async () => {
    const { parsePriceInput } = await import("./pricing");
    expect(parsePriceInput("1.5")).toBe(1.5);
    expect(parsePriceInput(2)).toBe(2);
    expect(parsePriceInput("0.10")).toBe(0.1);
  });

  it("returns null for empty, non-numeric or negative values", async () => {
    const { parsePriceInput } = await import("./pricing");
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("abc")).toBeNull();
    expect(parsePriceInput("-1")).toBeNull();
    expect(parsePriceInput(null as unknown as string)).toBeNull();
  });
});

describe("resolveEffectPrices", () => {
  it("returns defaults when no stored prices are provided", async () => {
    const { resolveEffectPrices, DEFAULT_PACK_PRICES } = await import("./pricing");
    expect(resolveEffectPrices(null)).toEqual(DEFAULT_PACK_PRICES);
    expect(resolveEffectPrices({})).toEqual(DEFAULT_PACK_PRICES);
  });

  it("overrides defaults with stored values and fills missing ones", async () => {
    const { resolveEffectPrices, DEFAULT_PACK_PRICES } = await import("./pricing");
    const result = resolveEffectPrices({ "jump-scare": 10, "screen-cover": null as unknown as number });
    expect(result["jump-scare"]).toBe(10);
    expect(result["screen-flash"]).toBe(DEFAULT_PACK_PRICES["screen-flash"]);
    expect(result["tunnel-vision"]).toBe(DEFAULT_PACK_PRICES["tunnel-vision"]);
    expect(result["screen-cover"]).toBe(DEFAULT_PACK_PRICES["screen-cover"]);
  });

  it("ignores unknown effect identifiers", async () => {
    const { resolveEffectPrices, DEFAULT_PACK_PRICES } = await import("./pricing");
    const result = resolveEffectPrices({ unknown: 1 } as Record<string, number>);
    expect(result).toEqual(DEFAULT_PACK_PRICES);
  });
});

describe("rawMinimumAmount", () => {
  it("converts a display price to raw units using token decimals", async () => {
    const { rawMinimumAmount } = await import("./pricing");
    expect(rawMinimumAmount(1, 6)).toBe("1000000");
    expect(rawMinimumAmount(0.1, 6)).toBe("100000");
    expect(rawMinimumAmount(2.5, 7)).toBe("25000000");
  });

  it("rounds to integer raw units and rejects negative or non-finite prices", async () => {
    const { rawMinimumAmount } = await import("./pricing");
    expect(rawMinimumAmount(0.0000001, 6)).toBe("0");
    expect(rawMinimumAmount(-1, 6)).toBeNull();
    expect(rawMinimumAmount(NaN, 6)).toBeNull();
  });
});
