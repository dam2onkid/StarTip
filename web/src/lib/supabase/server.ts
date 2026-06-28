import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Supabase client for use in Server Components, Route Handlers, and Server
 * Actions. Reads the auth session from request cookies via `next/headers` and
 * writes refreshed tokens back through `setAll`. Uses the publishable anon
 * key; the user JWT is carried in the auth cookie and refreshed by the
 * middleware `updateSession` helper.
 *
 * Always create a new client per request: this function reads the current
 * request's cookie store, which is request-scoped.
 */
export async function createServerClient() {
  const cookieStore = await cookies();
  return createSSRServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `setAll` is called from a Server Component where cookies cannot
            // be set. The middleware `updateSession` helper handles cookie
            // refresh on the response; ignore here.
          }
        },
      },
    },
  );
}
