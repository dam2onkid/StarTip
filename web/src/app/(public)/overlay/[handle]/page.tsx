import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { OverlayAlerts, type OverlayDonation, type OverlayToken } from "./overlay-alerts";

/**
 * `/overlay/[handle]` — public OBS browser source. Resolves the Handle to its
 * `creator_profile_id` (registered + not paused), fetches the initial visible
 * confirmed/indexed donations and the token allowlist, and hands them to the
 * `<OverlayAlerts>` client component which subscribes to Supabase Realtime on
 * `donations` for live alerts.
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
    .select("contract_address,symbol");

  const initialDonations = (donations ?? []) as OverlayDonation[];
  const tokenAllowlist = (tokens ?? []) as OverlayToken[];

  return (
    <OverlayAlerts
      creatorProfileId={p.id}
      initialDonations={initialDonations}
      tokenAllowlist={tokenAllowlist}
    />
  );
}
