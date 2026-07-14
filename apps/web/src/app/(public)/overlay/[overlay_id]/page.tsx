import { notFound } from "next/navigation";
import { createServiceClient } from "@startip/shared/supabase/service";
import { OverlayAlerts } from "./overlay-alerts";
import {
  resolveOverlaySettings,
  type OverlayToken,
} from "@/lib/overlay/settings";

/**
 * `/overlay/[overlay_id]` - public OBS browser source. Resolves the opaque
 * Overlay ID to its `creator_profile_id` (registered + not paused), fetches
 * the token allowlist and the Creator's `overlay_settings` row, and hands them
 * to the `<OverlayAlerts>` client component which subscribes to Supabase
 * Realtime on `donations` for live alerts.
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
 * No auth required. The Overlay ID is resolved via the service role (bypasses
 * RLS) filtered to `onchain_registered = true AND paused = false`, so unknown
 * / not-registered / paused Overlay IDs 404. Historical donations are
 * intentionally not replayed on page load; the overlay only displays Realtime
 * events that arrive after the browser source is opened. The
 * `donations_anon_visible_select` RLS policy suppresses hidden rows on the
 * anon-key Realtime channel.
 *
 * The page renders a transparent, full-viewport surface so it composes
 * cleanly as an OBS browser source. `params` is a Promise in Next.js 15; the
 * async server component awaits it directly.
 */
export const dynamic = "force-dynamic";

export default async function OverlayPage({
  params,
}: {
  params: Promise<{ overlay_id: string }>;
}) {
  const { overlay_id } = await params;
  const normalized = overlay_id.trim();
  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("id,onchain_registered,paused")
    .eq("overlay_id", normalized)
    .maybeSingle();

  const p = profile as {
    id: string;
    onchain_registered: boolean;
    paused: boolean;
  } | null;

  if (!p || !p.onchain_registered || p.paused) {
    notFound();
  }

  const { data: tokens } = await service
    .from("tokens")
    .select("contract_address,symbol,decimals");

  const { data: settingsRow } = await service
    .from("overlay_settings")
    .select("alert_duration_ms,min_amount,sound_enabled,tts_enabled,tts_voice")
    .eq("creator_profile_id", p.id)
    .maybeSingle();

  const tokenAllowlist = (tokens ?? []) as OverlayToken[];
  const settings = resolveOverlaySettings(settingsRow, tokenAllowlist);

  return (
    <OverlayAlerts
      creatorProfileId={p.id}
      initialDonations={[]}
      tokenAllowlist={tokenAllowlist}
      settings={settings}
    />
  );
}


