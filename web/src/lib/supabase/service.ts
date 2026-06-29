import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Supabase client authenticated with the service role key. Bypasses Row Level
 * Security, so it MUST stay server-side and MUST NEVER be exposed to the
 * browser. Use it for route handlers that write authoritative state the client
 * is not allowed to write directly: the indexer poll job, donations prepare /
 * confirm, and creator profile reservations.
 *
 * `persistSession` is disabled and `autoRefreshToken` is off because the
 * service role key is not a user session.
 */
export function createServiceClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
