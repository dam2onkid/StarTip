/**
 * Pure, client-safe display/raw amount conversion helpers.
 *
 * Stellar Soroban token amounts are i128 integers in raw units (the smallest
 * divisible unit, `10^decimals` per display unit). The `donations.amount`
 * column and the `donation_goals.target_amount` column store raw numeric
 * strings. The UI converts between what a human types (display units, e.g.
 * "1.5") and what the contract stores (raw units, e.g. "1500000" at 6
 * decimals) using these helpers.
 *
 * The module has no `server-only` marker and imports nothing, so it is safe
 * to import from client components, server components, and tests alike.
 */

/**
 * Convert a display amount (e.g. "1.5") to a raw i128 string using the token's
 * `decimals`. Handles empty/zero input and truncates the fractional part to
 * `decimals` places (no rounding). Returns a non-negative integer string with
 * no leading zeros (or `"0"`).
 */
export function displayToRawAmount(display: string, decimals: number): string {
  const trimmed = display.trim();
  if (!trimmed) return "0";
  // Split into integer and fractional parts.
  const [intPart, fracPart = ""] = trimmed.split(".");
  const padded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  const raw = `${intPart}${padded}`.replace(/^0+/, "") || "0";
  return raw;
}

/**
 * Convert a raw i128 numeric string back to a display string using the token's
 * `decimals`. Trims trailing fractional zeros. Returns a non-negative display
 * string (e.g. "1.5" at 6 decimals). Non-numeric input falls back to "0".
 */
export function rawToDisplayAmount(raw: string, decimals: number): string {
  let v: bigint;
  try {
    v = BigInt(raw);
  } catch {
    return "0";
  }
  if (decimals <= 0) return v.toString();
  const divisor = BigInt(10) ** BigInt(decimals);
  const intPart = v / divisor;
  const frac = v % divisor;
  if (frac === BigInt(0)) return intPart.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
}
