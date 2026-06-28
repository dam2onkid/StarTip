import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Supabase client for use in Client Components. Uses the publishable anon key
 * and the singleton behavior built into `@supabase/ssr`'s `createBrowserClient`,
 * so the same instance is returned across calls in the browser.
 *
 * The overlay uses the anon key for Realtime subscriptions; the dashboard uses
 * the user JWT carried in the auth cookie (managed by the SSR session).
 */
export function createBrowserClient() {
  return createSSRBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
