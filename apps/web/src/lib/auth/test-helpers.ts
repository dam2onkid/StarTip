import { vi } from "vitest";
import { NextResponse } from "next/server";

const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Build an AuthContext-shaped error for mocking the AuthContext boundary.
 * The `code` and `status` are included so the object matches the real
 * `AuthError` shape (routes only use `ok` and `response`).
 */
export function authError(code: string, status: number) {
  return {
    ok: false,
    code,
    status,
    response: NextResponse.json({ error: code }, { status }),
  };
}

/**
 * Build an AuthContext-shaped success for mocking the AuthContext boundary.
 * `user.id` is derived from `profile.user_id` so the mock matches the real
 * boundary invariant that the loaded profile belongs to the authenticated user.
 * `fromFn` is the `supabase.from` implementation to use; it defaults to a
 * fresh `vi.fn()` for tests that do not exercise the session client.
 */
export function authContext(
  profile: Record<string, unknown>,
  fromFn: (...args: unknown[]) => unknown = vi.fn(),
) {
  const userId =
    typeof profile.user_id === "string" ? profile.user_id : DEFAULT_USER_ID;
  return {
    ok: true,
    context: {
      user: { id: userId },
      profile,
      supabase: { from: fromFn },
    },
  };
}
