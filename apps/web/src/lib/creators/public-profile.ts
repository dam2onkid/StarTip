import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `GET /api/creators/[handle]` core logic, extracted so it can be tested as a
 * pure function of `(deps, handle) -> { status, body }` without a Next.js
 * request context. The route handler in
 * `app/api/creators/[handle]/route.ts` is a thin wrapper that builds the deps
 * and maps the result to a `NextResponse`.
 *
 * The service client (service role, bypasses RLS) reads the `public_profiles`
 * view, which already filters `onchain_registered = true AND paused = false`
 * and exposes only the public columns (`handle`, `display_name`, `avatar_url`,
 * `bio`, `onchain_registered`). A handle that is unknown, not yet registered,
 * or paused simply does not appear in the view, so all three cases collapse to
 * a 404.
 */

export interface PublicProfileDeps {
  /** Service-role client (bypasses RLS). Reads the public_profiles view. */
  service: SupabaseClient;
}

export interface PublicProfile {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  onchain_registered: boolean;
}

export interface PublicProfileErrorBody {
  error: string;
}

export interface PublicProfileResult {
  status: number;
  body: PublicProfile | PublicProfileErrorBody;
}

/**
 * Read a Creator's public profile by handle. The handle is trimmed and
 * lowercased before filtering, matching the canonical Handle rules.
 *
 * Errors:
 *   404 `creator_not_found` — unknown handle, or not registered, or paused
 *     (the `public_profiles` view excludes all three).
 *   500 `db_error` — the underlying query failed.
 */
export async function getPublicProfile(
  deps: PublicProfileDeps,
  handle: string,
): Promise<PublicProfileResult> {
  const normalized = typeof handle === "string" ? handle.trim().toLowerCase() : "";
  const { data, error } = await deps.service
    .from("public_profiles")
    .select("handle,display_name,avatar_url,bio,onchain_registered")
    .eq("handle", normalized)
    .maybeSingle();
  if (error) return { status: 500, body: { error: "db_error" } };
  if (!data) return { status: 404, body: { error: "creator_not_found" } };
  return { status: 200, body: data as PublicProfile };
}
