import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared Live Event expiry sweep.
 *
 * Queued events whose `expires_at` has passed without a client `started`
 * acknowledgement are marked `missed`. This keeps the durable queue honest
 * about events the client never began, without depending on the client to
 * report anything.
 */

export interface SweepResult {
  updated: number;
  error: string | null;
}

/**
 * Mark every `queued` Live Event with `expires_at < before` as `missed`.
 * Returns the number of rows updated.
 */
export async function sweepExpiredLiveEvents(
  service: SupabaseClient,
  before: string,
): Promise<SweepResult> {
  const { data, error } = await service
    .from("live_events")
    .update({ status: "missed", ack_terminal_at: before })
    .eq("status", "queued")
    .lt("expires_at", before)
    .select("id");

  if (error) {
    return { updated: 0, error: error.message };
  }

  const updated = Array.isArray(data) ? data.length : 0;
  return { updated, error: null };
}
