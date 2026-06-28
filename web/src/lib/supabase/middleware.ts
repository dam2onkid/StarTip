import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Placeholder login URL. No login UI is implemented in this issue; subsequent
 * auth work will replace this with the real Supabase Auth redirect target.
 */
export const LOGIN_REDIRECT_URL = "/login";

/**
 * Refreshes the Supabase auth session on every matched request and redirects
 * unauthenticated requests to `(auth)/*` routes to the placeholder login URL.
 *
 * Uses `@supabase/ssr`'s `createServerClient` wired to the request and response
 * cookies so token refreshes are written back to the browser. The matcher
 * (exported via `config`) restricts this to `(auth)/*` and excludes `api/`,
 * `_next/`, and static assets.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/onboarding");

  if (!user && isAuthRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_REDIRECT_URL;
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/|_next/|_static|favicon.ico|.*\\.).*)",
  ],
};
