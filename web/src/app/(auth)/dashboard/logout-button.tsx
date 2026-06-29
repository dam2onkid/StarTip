"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Logout action for the dashboard shell. Calls Supabase Auth `signOut` on the
 * browser client, then navigates to `/login`. Client component because it
 * needs the router and the browser Supabase client for the session cookie
 * clear.
 */
export function LogoutButton() {
  const router = useRouter();

  async function onLogout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onLogout}>
      Log out
    </Button>
  );
}
