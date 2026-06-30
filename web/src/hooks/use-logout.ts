"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Shared Supabase Auth `signOut` + redirect-to-`/login` handler.
 *
 * Used by both the dashboard `LogoutButton` and the nav avatar menu's "Logout"
 * item so the `signOut` call lives in exactly one place (PRD: Unified hybrid
 * navigation, issue 03). Calls `signOut` on the browser Supabase client to
 * clear the session cookie, then navigates to `/login`.
 */
export function useLogout() {
  const router = useRouter();

  return async function logout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  };
}
