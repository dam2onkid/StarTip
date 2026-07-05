import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Nav auth-state resolution (PRD: Unified hybrid navigation, issue 03).
 *
 * The root `app/layout.tsx` resolves the Supabase session server-side (via the
 * existing `lib/supabase/server.ts` `createServerClient` + `auth.getUser`
 * pattern) and passes the result to `SiteNav` as a serializable prop. This
 * module is the pure `(supabase) -> NavAuth` extraction so the session -> nav
 * mapping is testable without a Next.js request context, mirroring the
 * `getPublicProfile` extraction pattern.
 *
 * The profile is read with the caller's RLS-bearing client (the
 * `profiles_user_select` policy exposes `user_id = auth.uid()`), the same path
 * the dashboard page uses. `display_name` falls back to `"Anonymous"` and
 * `email` to `""` when the profile row or email is absent, so the avatar menu
 * always has a header to render.
 */

export type NavAuth =
  | { state: "unauthenticated" }
  | {
      state: "authenticated";
      displayName: string;
      email: string;
      avatarUrl: string | null;
    };

export async function resolveNavAuth(
  supabase: SupabaseClient,
): Promise<NavAuth> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    state: "authenticated",
    displayName: profile?.display_name ?? "Anonymous",
    email: user.email ?? "",
    avatarUrl: profile?.avatar_url ?? null,
  };
}
