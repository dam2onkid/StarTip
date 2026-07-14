import { NextResponse } from "next/server";
import { requireAuthedProfile } from "@/lib/auth/context";
import { createServiceClient } from "@startip/shared/supabase/service";
import { generateOverlayId } from "@startip/shared/overlay/id";

/**
 * POST /api/overlay/regenerate - generate a new Overlay ID for the caller.
 *
 * The authed creator may regenerate their Overlay ID at any time. The previous
 * `/overlay/[overlay_id]` URL stops resolving immediately (the route is looked
 * up by the new ID, and the old ID is no longer on the profile). The new ID is
 * returned so the dashboard can update the displayed URL.
 */
export async function POST() {
  const auth = await requireAuthedProfile();
  if (!auth.ok) return auth.response;

  const { profile } = auth.context;
  if (!profile.onchain_registered || profile.paused) {
    return NextResponse.json({ error: "not_active" }, { status: 403 });
  }

  const newOverlayId = generateOverlayId();

  const service = createServiceClient();
  const { error: updateErr } = await service
    .from("profiles")
    .update({ overlay_id: newOverlayId })
    .eq("id", profile.id);
  if (updateErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json({ overlay_id: newOverlayId }, { status: 200 });
}
