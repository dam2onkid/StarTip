"use client";

import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Shared Supabase Auth `signOut` + redirect-to-`/login` handler.
 *
 * Used by the nav avatar menu's "Logout" item (and the dashboard `LogoutButton`
 * when it is mounted) so the `signOut` call lives in exactly one place (PRD:
 * Unified hybrid navigation, issue 03). Calls `signOut` on the browser Supabase
 * client to clear the session cookie, then forces a full browser navigation to
 * `/login`.
 *
 * A full navigation is used instead of `router.push` + `router.refresh()` so
 * the App Router does not reuse a prefetched `/login` response that was
 * rendered with the old, still-authenticated session. After `signOut` clears
 * the cookie, a fresh request to `/login` re-runs `resolveNavAuth` in the root
 * layout and guarantees the nav no longer shows the cached profile.
 */
export function useLogout() {
  return async function logout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };
}
