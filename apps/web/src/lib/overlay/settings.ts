/**
 * Pure, client-safe Overlay settings helpers.
 *
 * The Overlay server component (`app/(public)/overlay/[overlay_id]/page.tsx`)
 * loads the Creator's `overlay_settings` row (or falls back to the column
 * defaults when no row exists), resolves `min_amount` from display units to
 * raw units (multiplied by 10^decimals for the donation's token), and passes
 * the resolved settings to the `<OverlayAlerts>` client component. The client
 * applies {@link shouldShowAlert} to suppress donations below `min_amount`
 * and {@link alertDurationMs} to auto-dismiss each alert after the configured
 * duration.
 *
 * The module has no `server-only` marker and imports nothing, so it is safe
 * to import from client components, server components, and tests alike.
 */

/** The default alert duration (ms) when no row exists or the field is missing. */
export const DEFAULT_ALERT_DURATION_MS = 10000;

/** Minimum/maximum allowed `alert_duration_ms` (matches the API validation). */
export const MIN_ALERT_DURATION_MS = 1000;
export const MAX_ALERT_DURATION_MS = 60000;

/**
 * Resolved Overlay settings as seen by the client. The server component
 * converts `min_amount` from display units to raw units before building this
 * object, so the client compares raw `amount` (i128) against raw
 * `minAmountRaw` without a per-alert decimals lookup.
 */
export interface OverlaySettings {
  /** Alert duration in ms, or `undefined` when the row used the column default. */
  alertDurationMs?: number;
  /** `min_amount` in raw units (a numeric string, i128-scale), or `undefined` for 0. */
  minAmountRaw?: string;
  /** Whether a sound plays on Realtime insert. Defaults to `true`. */
  soundEnabled?: boolean;
}

/** A donation with the fields the filter needs (raw `amount` as a numeric string). */
export interface OverlayDonationFilter {
  amount: string;
}

/**
 * Whether a donation should appear on the Overlay. Returns `false` when the
 * donation's raw `amount` is strictly less than the Creator's `min_amount`
 * (in raw units). The boundary is inclusive: a donation equal to `min_amount`
 * is shown. A missing `minAmountRaw` is treated as `0` (no threshold).
 *
 * Non-numeric `amount` values are shown (defensive: never silently suppress a
 * real alert because of a malformed row).
 */
export function shouldShowAlert(
  donation: OverlayDonationFilter,
  settings: OverlaySettings,
): boolean {
  const minRaw = settings.minAmountRaw ?? "0";
  let amount: bigint;
  let min: bigint;
  try {
    amount = BigInt(donation.amount);
    min = BigInt(minRaw);
  } catch {
    return true;
  }
  return amount >= min;
}

/**
 * The configured alert duration in ms, clamped to the 1000-60000 band, with
 * the 10000ms default when the field is missing or not a finite number. The
 * clamp mirrors the API validation so a stale/invalid row never produces an
 * unworkable timer (e.g. 0ms or 99999ms).
 */
export function alertDurationMs(settings: OverlaySettings): number {
  const raw = settings.alertDurationMs;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_ALERT_DURATION_MS;
  }
  if (raw < MIN_ALERT_DURATION_MS) return MIN_ALERT_DURATION_MS;
  if (raw > MAX_ALERT_DURATION_MS) return MAX_ALERT_DURATION_MS;
  return raw;
}
