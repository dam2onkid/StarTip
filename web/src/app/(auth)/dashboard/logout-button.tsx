"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/hooks/use-logout";

/**
 * Logout action for the dashboard shell. Delegates the Supabase Auth
 * `signOut` + redirect-to-`/login` path to the shared `useLogout` hook so the
 * nav avatar menu (PRD: Unified hybrid navigation, issue 03) reuses the same
 * handler instead of duplicating the `signOut` call. Shows a spinner + disables
 * itself while the async `signOut` is in flight (AGENTS.md §Loading state).
 */
export function LogoutButton() {
  const logout = useLogout();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await logout();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={loading}
      onClick={handleLogout}
    >
      Log out
    </Button>
  );
}
