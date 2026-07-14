import type { SupabaseClient } from "@supabase/supabase-js";
import { toByteaHex } from "../bytea";

/**
 * Off-chain Profile fields needed by the indexer and verify paths when resolving
 * a Creator by `handle_hash`.
 */
export interface CreatorProfile {
  id: string;
  owner_address: string | null;
  /** The formatted Postgres `bytea` hex literal (`\x...`) for the handle hash. */
  handle_hash: string;
  overlay_id: string | null;
}

/**
 * Resolve a Creator Profile by its on-chain `Creator ID Hash` (the raw
 * `sha256(handle)` bytes). Returns `null` when no matching profile exists or the
 * query fails - the indexer treats both cases as an orphan event and moves on.
 *
 * This hides the `bytea` hex formatting (`\x` prefix) and the `profiles` lookup
 * from callers.
 */
export async function resolveProfileByHandleHash(
  supabase: SupabaseClient,
  handleHash: Uint8Array,
): Promise<CreatorProfile | null> {
  const handleHashBytea = toByteaHex(handleHash);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, owner_address, overlay_id")
    .eq("handle_hash", handleHashBytea)
    .maybeSingle();
  if (error || !data) return null;
  const profile = data as Partial<CreatorProfile>;
  return {
    id: profile.id as string,
    owner_address: profile.owner_address ?? null,
    handle_hash: handleHashBytea,
    overlay_id: profile.overlay_id ?? null,
  };
}
