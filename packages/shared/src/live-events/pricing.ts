/**
 * Shared Live Events pricing contract.
 *
 * Effect Prices are minimum total Donation amounts expressed in display units
 * (e.g. test USDC). The Default Pack supplies an initial value for each effect
 * and Creators may edit any price subject to the shared platform floor. This
 * module is framework-agnostic and used by the Web app, Worker, and tests.
 */

/** Effect identifiers in the bundled Default Pack. */
export const DEFAULT_EFFECT_IDS = [
  "screen-flash",
  "jump-scare",
  "tunnel-vision",
  "screen-cover",
] as const;

/** Effect type for a Default Pack effect identifier. */
export type DefaultEffectId = (typeof DEFAULT_EFFECT_IDS)[number];

/**
 * Default Effect Prices for the Default Pack, in display units.
 * Screen Flash: 1, Jump Scare: 2, Tunnel Vision: 3, Screen Cover: 5.
 */
export const DEFAULT_PACK_PRICES: Record<DefaultEffectId, number> = {
  "screen-flash": 1,
  "jump-scare": 2,
  "tunnel-vision": 3,
  "screen-cover": 5,
};

/** Shared platform floor for Creator-edited Effect Prices, in display units. */
export const PLATFORM_FLOOR_USDC = 0.1;

export type ValidatePriceError = "price_below_floor" | "invalid_price";

export type ValidatePriceResult =
  | { ok: true }
  | { ok: false; error: ValidatePriceError };

/**
 * Validate a Creator-edited Effect Price. Prices must be finite numbers at or
 * above the shared platform floor. The default prices already satisfy this,
 * so this guard applies to every write boundary.
 */
export function validateEffectPrice(
  price: number,
  floor: number = PLATFORM_FLOOR_USDC,
): ValidatePriceResult {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return { ok: false, error: "invalid_price" };
  }
  if (price < floor) {
    return { ok: false, error: "price_below_floor" };
  }
  return { ok: true };
}

/**
 * Parse a price from a form input. Returns a finite non-negative number, or
 * `null` when the input cannot be parsed or is negative.
 */
export function parsePriceInput(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const num = Number(input);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

/**
 * Resolve a Creator's stored Effect Prices by filling missing values from the
 * Default Pack. Unknown effect identifiers are ignored.
 */
export function resolveEffectPrices(
  stored: Partial<Record<string, number>> | null,
): Record<DefaultEffectId, number> {
  const result: Record<DefaultEffectId, number> = { ...DEFAULT_PACK_PRICES };
  if (!stored) return result;

  for (const id of DEFAULT_EFFECT_IDS) {
    const value = stored[id];
    if (typeof value === "number" && Number.isFinite(value)) {
      result[id] = value;
    }
  }

  return result;
}

/**
 * Convert a display Effect Price to raw token units using the token's decimals.
 * Returns `null` when the price is negative or non-finite.
 */
export function rawMinimumAmount(price: number, decimals: number): string | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
  const multiplier = 10 ** decimals;
  const raw = BigInt(Math.round(price * multiplier));
  return raw.toString();
}
