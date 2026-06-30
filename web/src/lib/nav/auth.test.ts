// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `resolveNavAuth` (PRD: Unified hybrid navigation, issue 03).
 *
 * The root layout resolves the Supabase session server-side and derives the
 * nav's auth state plus the caller's Profile identity (display_name, email,
 * avatar_url). This is the pure `(supabase) -> NavAuth` extraction so the
 * session -> nav-auth mapping is testable without a Next.js request context,
 * mirroring the `getPublicProfile` extraction pattern.
 */

function makeClient(opts: {
  user?: { id: string; email?: string } | null;
  profile?: { display_name: string; avatar_url: string | null } | null;
  userError?: unknown;
  profileError?: unknown;
} = {}): SupabaseClient {
  const getUser = vi.fn(async () => ({
    data: { user: opts.user ?? null },
    error: opts.userError ?? null,
  }));
  const maybeSingle = vi.fn(async () => ({
    data: opts.profile === undefined ? null : opts.profile,
    error: opts.profileError ?? null,
  }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq, maybeSingle }));
  const from = vi.fn(() => ({ select }));
  return { auth: { getUser }, from } as unknown as SupabaseClient;
}

describe("resolveNavAuth", () => {
  it("returns unauthenticated when there is no user", async () => {
    const { resolveNavAuth } = await import("./auth");
    const res = await resolveNavAuth(makeClient({ user: null }));
    expect(res).toEqual({ state: "unauthenticated" });
  });

  it("returns authenticated with display_name, email, and avatar_url from the profile", async () => {
    const { resolveNavAuth } = await import("./auth");
    const res = await resolveNavAuth(
      makeClient({
        user: { id: "u1", email: "fan@example.com" },
        profile: { display_name: "Fan", avatar_url: "https://x/a.png" },
      }),
    );
    expect(res).toEqual({
      state: "authenticated",
      displayName: "Fan",
      email: "fan@example.com",
      avatarUrl: "https://x/a.png",
    });
  });

  it("falls back to a null avatar when the profile has no avatar_url", async () => {
    const { resolveNavAuth } = await import("./auth");
    const res = await resolveNavAuth(
      makeClient({
        user: { id: "u1", email: "fan@example.com" },
        profile: { display_name: "Fan", avatar_url: null },
      }),
    );
    expect(res).toMatchObject({ state: "authenticated", avatarUrl: null });
  });

  it("falls back to 'Anonymous' display name and empty email when the profile row is missing", async () => {
    const { resolveNavAuth } = await import("./auth");
    const res = await resolveNavAuth(
      makeClient({
        user: { id: "u1" },
        profile: null,
      }),
    );
    expect(res).toMatchObject({
      state: "authenticated",
      displayName: "Anonymous",
      email: "",
    });
  });
});
