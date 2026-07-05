import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client authenticated with the service role key. Bypasses Row Level
 * Security, so it MUST stay server-side and MUST NEVER be exposed to the
 * browser. Use it for route handlers that write authoritative state the client
 * is not allowed to write directly: the indexer poll job, donations prepare /
 * confirm, and creator profile reservations.
 *
 * Credentials are read from `process.env.SUPABASE_URL` and
 * `process.env.SUPABASE_SERVICE_ROLE_KEY`. Both the Next.js app (via
 * `@t3-oss/env-nextjs`, which populates `process.env` at boot) and the worker
 * (via its zod env schema) validate these before any call reaches here.
 *
 * `persistSession` is disabled and `autoRefreshToken` is off because the
 * service role key is not a user session.
 */
export function createServiceClient() {
  return createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
