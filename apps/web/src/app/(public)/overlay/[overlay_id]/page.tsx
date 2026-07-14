import { notFound } from "next/navigation";
import { createServiceClient } from "@startip/shared/supabase/service";
import { goalProgress } from "@/lib/creators/goal";
import { OverlayAlerts } from "./overlay-alerts";
import { type OverlayGoal } from "./overlay-goal";
import {
  resolveOverlaySettings,
  type OverlayToken,
} from "@/lib/overlay/settings";

/**
 * `/overlay/[overlay_id]` - public OBS browser source. Resolves the opaque
 * Overlay ID to its `creator_profile_id` (registered + not paused), fetches
 * the token allowlist, the Creator's `overlay_settings` row, and the active
 * donation goal, and hands them to the `<OverlayAlerts>` client component
 * which subscribes to Supabase Realtime on `donations` for live alerts and
 * live goal progress updates.
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
 * Donation goal: the server loads the Creator's `donation_goals` row and sums
 * all confirmed/indexed visible donations in the goal's token to compute the
 * initial `{ current, target, pct }`. The client adds the amount of each
 * subsequent Realtime INSERT in the goal's token to keep the bar live. The
 * token's `symbol` and `decimals` are resolved from the allowlist for display.
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

  const [profileResult, tokensResult] = await Promise.all([
    service
      .from("profiles")
      .select("id,onchain_registered,paused")
      .eq("overlay_id", normalized)
      .maybeSingle(),
    service.from("tokens").select("contract_address,symbol,decimals"),
  ]);

  const { data: profile } = profileResult;
  const { data: tokens } = tokensResult;

  const p = profile as {
    id: string;
    onchain_registered: boolean;
    paused: boolean;
  } | null;

  if (!p || !p.onchain_registered || p.paused) {
    notFound();
  }

  const [settingsResult, goalRowResult] = await Promise.all([
    service
      .from("overlay_settings")
      .select("alert_duration_ms,min_amount,sound_enabled,tts_enabled,tts_voice")
      .eq("creator_profile_id", p.id)
      .maybeSingle(),
    service
      .from("donation_goals")
      .select("target_amount,token")
      .eq("creator_profile_id", p.id)
      .maybeSingle(),
  ]);

  const { data: settingsRow } = settingsResult;
  const { data: goalRow } = goalRowResult;

  const tokenAllowlist = (tokens ?? []) as OverlayToken[];
  const settings = resolveOverlaySettings(settingsRow, tokenAllowlist);

  let goal: OverlayGoal | null = null;
  if (goalRow) {
    const g = goalRow as { target_amount: string | number; token: string };
    const { data: goalDonations } = await service
      .from("donations")
      .select("amount,token")
      .eq("creator_profile_id", p.id)
      .eq("token", g.token)
      .in("status", ["confirmed", "indexed"])
      .eq("moderation_status", "visible");

    const progress = goalProgress(
      (goalDonations ?? []).map((d) => ({
        token: String((d as { token: unknown }).token),
        amount: String((d as { amount: unknown }).amount),
      })),
      { token: g.token, targetAmount: String(g.target_amount) },
    );

    const tokenEntry = tokenAllowlist.find((t) => t.contract_address === g.token);
    goal = {
      ...progress,
      token: g.token,
      symbol: tokenEntry?.symbol ?? g.token,
      decimals: tokenEntry?.decimals ?? 0,
    };
  }

  return (
    <OverlayAlerts
      creatorProfileId={p.id}
      overlayId={normalized}
      initialDonations={[]}
      tokenAllowlist={tokenAllowlist}
      settings={settings}
      goal={goal}
    />
  );
}


