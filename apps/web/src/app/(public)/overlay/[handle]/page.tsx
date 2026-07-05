import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { OverlayAlerts, type OverlayDonation, type OverlayToken } from "./overlay-alerts";
import type { OverlaySettings } from "@/lib/overlay/settings";

/**
 * `/overlay/[handle]` — public OBS browser source. Resolves the Handle to its
 * `creator_profile_id` (registered + not paused), fetches the initial visible
 * confirmed/indexed donations, the token allowlist, and the Creator's
 * `overlay_settings` row, and hands them to the `<OverlayAlerts>` client
 * component which subscribes to Supabase Realtime on `donations` for live
 * alerts.
 *
 * Overlay settings (spec §11.3): the server loads the Creator's
 * `overlay_settings` row (or falls back to defaults when no row exists) and
 * resolves `min_amount` from display units to raw units using the token
 * decimals from the `tokens` table, so the client compares raw `amount`
 * (i128) against raw `min_amount` without a per-alert decimals lookup. The
 * client applies `shouldShowAlert` (suppress below `min_amount`),
 * `alertDurationMs` (auto-dismiss), and plays a sound on Realtime insert when
 * `sound_enabled` is true.
 *
 * No auth required. The handle is resolved via the service role (bypasses RLS)
 * filtered to `onchain_registered = true AND paused = false`, so unknown /
 * not-registered / paused handles 404. The initial donations read uses the
 * same `status IN ('confirmed','indexed') AND moderation_status = 'visible'`
 * filter the Realtime subscription uses, so hidden messages are suppressed
 * both on first paint and on live inserts (the
 * `donations_anon_visible_select` RLS policy enforces the same on the
 * anon-key Realtime channel).
 *
 * The page renders a transparent, full-viewport surface so it composes
 * cleanly as an OBS browser source. `params` is a Promise in Next.js 15; the
 * async server component awaits it directly.
 */
export const dynamic = "force-dynamic";

export default async function OverlayPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const normalized = handle.trim().toLowerCase();
  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("id,onchain_registered,paused")
    .eq("handle", normalized)
    .maybeSingle();

  const p = profile as {
    id: string;
    onchain_registered: boolean;
    paused: boolean;
  } | null;

  if (!p || !p.onchain_registered || p.paused) {
    notFound();
  }

  const { data: donations } = await service
    .from("donations")
    .select("id,donor_name,amount,token,message,created_at")
    .eq("creator_profile_id", p.id)
    .in("status", ["confirmed", "indexed"])
    .eq("moderation_status", "visible")
    .order("created_at", { ascending: true });

  const { data: tokens } = await service
    .from("tokens")
    .select("contract_address,symbol,decimals");

  const { data: settingsRow } = await service
    .from("overlay_settings")
    .select("alert_duration_ms,min_amount,sound_enabled")
    .eq("creator_profile_id", p.id)
    .maybeSingle();

  const initialDonations = (donations ?? []) as OverlayDonation[];
  const tokenAllowlist = (tokens ?? []) as OverlayToken[];
  const settings = resolveOverlaySettings(settingsRow, tokenAllowlist);

  return (
    <OverlayAlerts
      creatorProfileId={p.id}
      initialDonations={initialDonations}
      tokenAllowlist={tokenAllowlist}
      settings={settings}
    />
  );
}

/**
 * Resolve the raw `overlay_settings` row (or null) into the client-facing
 * `OverlaySettings` shape. `min_amount` is converted from display units to
 * raw units (multiplied by 10^decimals) using the first token in the
 * allowlist (the MVP is single-token). When no row exists, the defaults
 * (6000ms, no threshold, sound on) apply.
 */
function resolveOverlaySettings(
  row: { alert_duration_ms: number | null; min_amount: string | null; sound_enabled: boolean | null } | null,
  tokenAllowlist: OverlayToken[],
): OverlaySettings {
  const settings: OverlaySettings = {};
  if (row) {
    if (row.alert_duration_ms !== null) {
      settings.alertDurationMs = row.alert_duration_ms;
    }
    if (row.sound_enabled !== null) {
      settings.soundEnabled = row.sound_enabled;
    }
    if (row.min_amount !== null) {
      const decimals = tokenAllowlist[0]?.decimals ?? 0;
      settings.minAmountRaw = displayToRaw(row.min_amount, decimals);
    }
  }
  return settings;
}

/**
 * Convert a display-amount numeric string to raw units by shifting the
 * decimal point by `decimals` places. Handles integer and fractional display
 * strings exactly (no floating-point loss). Truncates extra fractional digits
 * beyond the token's decimals.
 */
function displayToRaw(display: string, decimals: number): string {
  const cleaned = display.trim();
  if (cleaned === "") return "0";
  const negative = cleaned.startsWith("-");
  if (negative) return "0"; // min_amount is validated >= 0; defensive.
  const [intPart, fracPart = ""] = cleaned.split(".");
  const intDigits = intPart.replace(/^0+/, "") || "0";
  const fracDigits = (fracPart + "0".repeat(Math.max(0, decimals))).slice(0, decimals);
  const raw = (intDigits + fracDigits).replace(/^0+/, "") || "0";
  return raw;
}
