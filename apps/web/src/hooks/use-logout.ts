"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Shared Supabase Auth `signOut` + redirect-to-`/login` handler.
 *
 * Used by both the dashboard `LogoutButton` and the nav avatar menu's "Logout"
 * item so the `signOut` call lives in exactly one place (PRD: Unified hybrid
 * navigation, issue 03). Calls `signOut` on the browser Supabase client to
 * clear the session cookie, then refreshes the router cache and navigates to
 * `/login`.
 *
 * `router.refresh()` is what makes the nav update: the nav's auth state is
 * resolved server-side in the root `app/layout.tsx` via `resolveNavAuth`, and
 * the App Router caches server components across client-side navigations.
 * Without `refresh`, the cached layout keeps the authenticated state and the
 * nav stays authed after logout. `refresh` invalidates that cache so the
 * layout re-runs `resolveNavAuth` against the now-cleared session cookie and
 * the nav re-renders unauthenticated.
 */
export function useLogout() {
  const router = useRouter();

  return async function logout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  };
}
