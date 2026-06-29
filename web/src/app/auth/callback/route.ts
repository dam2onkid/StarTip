import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * `/auth/callback` — exchanges the Supabase Auth code for a session, then
 * redirects.
 *
 * Redirect logic: if `next` is present and not `/login`, redirect to `next`;
 * otherwise redirect to `/dashboard`. The `/login` guard prevents a redirect
 * loop back to the login page after a successful login.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");

  if (!code) {
    return NextResponse.json({ error: "code_exchange_failed" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.json({ error: "code_exchange_failed" }, { status: 400 });
  }

  const target = next && next !== "/login" ? next : "/dashboard";
  url.pathname = target;
  url.searchParams.delete("code");
  url.searchParams.delete("next");
  return NextResponse.redirect(url);
}
