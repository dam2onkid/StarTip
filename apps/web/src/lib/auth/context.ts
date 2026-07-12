import "server-only";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { normalizeHandle } from "@/lib/creators/handle-shared";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type CreatorProfile = Profile & { handle: string };

export type AuthErrorCode =
  | "unauthorized"
  | "profile_not_found"
  | "db_error"
  | "not_creator"
  | "forbidden";

export type AuthError = {
  ok: false;
  code: AuthErrorCode;
  status: 400 | 401 | 403 | 404 | 500;
  response: NextResponse;
};

export type AuthContext = {
  // SupabaseClient is intentionally generic: the generated Database types do
  // not yet include donation_goals / overlay_settings, so routes use the same
  // runtime client as before and remain unchanged.
  supabase: SupabaseClient;
  user: User;
  profile: Profile;
};

export type CreatorAuthContext = AuthContext & {
  profile: CreatorProfile;
};

export type AuthResult =
  | { ok: true; context: AuthContext }
  | AuthError;

export type CreatorAuthResult =
  | { ok: true; context: CreatorAuthContext }
  | AuthError;

function errorResponse(
  code: AuthErrorCode,
  status: AuthError["status"],
): AuthError {
  return {
    ok: false,
    code,
    status,
    response: NextResponse.json({ error: code }, { status }),
  };
}

/**
 * Require an authenticated user with a profile row.
 *
 * Returns an AuthContext (server client, user, profile) or a typed
 * 401/404/500 error. All protected API routes use this as the single seam for
 * session validation and profile loading.
 */
export async function requireAuthedProfile(): Promise<AuthResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return errorResponse("unauthorized", 401);
  }

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const profile = data as Profile | null;
  if (profileError) {
    return errorResponse("db_error", 500);
  }
  if (!profile) {
    return errorResponse("profile_not_found", 404);
  }

  return { ok: true, context: { supabase, user, profile } };
}

/**
 * Require an authenticated Creator (a profile with a handle).
 *
 * When `handle` is provided, it is treated as an ownership check and the
 * caller's normalized handle must match. Returns an AuthContext or a typed
 * 400/403/404/500 error.
 */
export async function requireAuthedCreator(handle?: string): Promise<CreatorAuthResult> {
  const auth = await requireAuthedProfile();
  if (!auth.ok) return auth;

  const { profile } = auth.context;
  if (!profile.handle) {
    return errorResponse("not_creator", 400);
  }

  if (handle !== undefined) {
    const normalizedPath = normalizeHandle(handle);
    const normalizedHandle = normalizeHandle(profile.handle);
    if (
      !normalizedPath.ok ||
      !normalizedHandle.ok ||
      normalizedPath.value !== normalizedHandle.value
    ) {
      return errorResponse("forbidden", 403);
    }
  }

  return {
    ok: true,
    context: { ...auth.context, profile: profile as CreatorProfile },
  };
}
