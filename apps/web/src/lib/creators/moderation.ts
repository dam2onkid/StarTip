import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Creator moderation helper for the `/dashboard` Creator tab.
 *
 * The Creator toggles a donation's `moderation_status` between `visible` and
 * `hidden` from the dashboard. The update goes through the browser Supabase
 * client so the `donations_creator_moderation_update` RLS policy
 * (`auth.uid() = profiles.user_id` join on `creator_profile_id`) and the
 * column-level GRANT (only `moderation_status` is writable) apply directly
 * from the browser. The service role is never involved: a non-creator or a
 * donor cannot update moderation_status because the RLS policy's subquery
 * finds no matching profile row.
 *
 * Hidden donations do not appear on the Overlay (the Overlay subscribes to
 * rows with `moderation_status = 'visible'`).
 */

export type ModerationStatus = "visible" | "hidden";

export interface ModerationResult {
  ok: boolean;
  error?: string;
}

/**
 * Update a donation's `moderation_status` via the creator RLS UPDATE path.
 * The supabase client must be the browser client carrying the Creator's
 * session. Returns `{ ok: true }` on success or `{ ok: false, error }` when
 * the PATCH is rejected (RLS denial or invalid status).
 */
export async function updateDonationModerationStatus(
  supabase: SupabaseClient,
  donationId: string,
  status: ModerationStatus,
): Promise<ModerationResult> {
  if (status !== "visible" && status !== "hidden") {
    return { ok: false, error: "Invalid moderation status." };
  }
  const { error } = await supabase
    .from("donations")
    .update({ moderation_status: status })
    .eq("id", donationId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
