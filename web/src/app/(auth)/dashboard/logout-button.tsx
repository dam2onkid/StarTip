"use client";

import { Button } from "@/components/ui/button";
import { useLogout } from "@/hooks/use-logout";

/**
 * Logout action for the dashboard shell. Delegates the Supabase Auth
 * `signOut` + redirect-to-`/login` path to the shared `useLogout` hook so the
 * nav avatar menu (PRD: Unified hybrid navigation, issue 03) reuses the same
 * handler instead of duplicating the `signOut` call.
 */
export function LogoutButton() {
  const logout = useLogout();

  return (
    <Button type="button" variant="outline" size="sm" onClick={logout}>
      Log out
    </Button>
  );
}
