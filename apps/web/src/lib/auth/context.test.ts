// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { Profile } from "@/lib/auth/context";

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));

const USER_ID = "00000000-0000-0000-0000-000000000001";
const HANDLE = "ada";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    user_id: USER_ID,
    display_name: "Ada",
    avatar_url: null,
    bio: null,
    created_at: new Date().toISOString(),
    handle: null,
    handle_hash: null,
    onchain_registered: false,
    onchain_registered_at: null,
    owner_address: null,
    paused: false,
    payout_address: null,
    wallet_link_nonce: null,
    wallet_link_nonce_expires_at: null,
    ...overrides,
  };
}

function makeClient(opts: {
  user?: User | null;
  userError?: unknown;
  profile?: Profile | null;
  profileError?: unknown;
} = {}): SupabaseClient {
  const getUser = vi.fn(async () => ({
    data: { user: opts.user ?? null },
    error: opts.userError ?? null,
  }));
  const maybeSingle = vi.fn(async () => ({
    data: opts.profile ?? null,
    error: opts.profileError ?? null,
  }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq, maybeSingle }));
  const from = vi.fn(() => ({ select }));
  const client = { auth: { getUser }, from } as unknown as SupabaseClient;
  (createServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(client);
  return client;
}

describe("requireAuthedProfile", () => {
  beforeEach(() => {
    (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("returns 401 unauthorized when there is no session", async () => {
    makeClient({ user: null });
    const { requireAuthedProfile } = await import("@/lib/auth/context");
    const res = await requireAuthedProfile();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("unauthorized");
    expect(res.response.status).toBe(401);
    expect(await res.response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 401 unauthorized when getUser fails", async () => {
    makeClient({ user: null, userError: { message: "jwt expired" } });
    const { requireAuthedProfile } = await import("@/lib/auth/context");
    const res = await requireAuthedProfile();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("unauthorized");
    expect(res.response.status).toBe(401);
    expect(await res.response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 500 db_error when the profile query fails", async () => {
    makeClient({ user: { id: USER_ID } as User, profileError: { message: "boom" } });
    const { requireAuthedProfile } = await import("@/lib/auth/context");
    const res = await requireAuthedProfile();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("db_error");
    expect(res.response.status).toBe(500);
    expect(await res.response.json()).toEqual({ error: "db_error" });
  });

  it("returns 404 profile_not_found when the user has no profile row", async () => {
    makeClient({ user: { id: USER_ID } as User, profile: null });
    const { requireAuthedProfile } = await import("@/lib/auth/context");
    const res = await requireAuthedProfile();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("profile_not_found");
    expect(res.response.status).toBe(404);
    expect(await res.response.json()).toEqual({ error: "profile_not_found" });
  });

  it("returns an AuthContext with the user, profile, and server client when authenticated", async () => {
    const client = makeClient({ user: { id: USER_ID } as User, profile: makeProfile({ handle: HANDLE }) });
    const { requireAuthedProfile } = await import("@/lib/auth/context");
    const res = await requireAuthedProfile();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.context.user.id).toBe(USER_ID);
    expect(res.context.profile.id).toBe("p1");
    expect(res.context.profile.handle).toBe(HANDLE);
    expect(res.context.supabase).toBe(client);
  });
});

describe("requireAuthedCreator", () => {
  beforeEach(() => {
    (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("propagates 401 from requireAuthedProfile", async () => {
    makeClient({ user: null });
    const { requireAuthedCreator } = await import("@/lib/auth/context");
    const res = await requireAuthedCreator();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("unauthorized");
    expect(res.response.status).toBe(401);
    expect(await res.response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 404 profile_not_found when the user has no profile row", async () => {
    makeClient({ user: { id: USER_ID } as User, profile: null });
    const { requireAuthedCreator } = await import("@/lib/auth/context");
    const res = await requireAuthedCreator();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("profile_not_found");
    expect(res.response.status).toBe(404);
    expect(await res.response.json()).toEqual({ error: "profile_not_found" });
  });

  it("returns 400 not_creator when the profile has no handle", async () => {
    makeClient({ user: { id: USER_ID } as User, profile: makeProfile() });
    const { requireAuthedCreator } = await import("@/lib/auth/context");
    const res = await requireAuthedCreator();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("not_creator");
    expect(res.response.status).toBe(400);
    expect(await res.response.json()).toEqual({ error: "not_creator" });
  });

  it("returns 400 not_creator when the path handle is provided but the profile has no handle", async () => {
    makeClient({ user: { id: USER_ID } as User, profile: makeProfile() });
    const { requireAuthedCreator } = await import("@/lib/auth/context");
    const res = await requireAuthedCreator(HANDLE);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("not_creator");
    expect(res.response.status).toBe(400);
    expect(await res.response.json()).toEqual({ error: "not_creator" });
  });

  it("returns 403 forbidden when the caller's handle does not match the path handle", async () => {
    makeClient({ user: { id: USER_ID } as User, profile: makeProfile({ handle: "bob" }) });
    const { requireAuthedCreator } = await import("@/lib/auth/context");
    const res = await requireAuthedCreator(HANDLE);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("forbidden");
    expect(res.response.status).toBe(403);
    expect(await res.response.json()).toEqual({ error: "forbidden" });
  });

  it("returns an AuthContext when the profile is a creator and no handle is provided", async () => {
    makeClient({ user: { id: USER_ID } as User, profile: makeProfile({ handle: HANDLE }) });
    const { requireAuthedCreator } = await import("@/lib/auth/context");
    const res = await requireAuthedCreator();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.context.profile.handle).toBe(HANDLE);
  });

  it("returns an AuthContext when the profile handle matches the path handle", async () => {
    makeClient({ user: { id: USER_ID } as User, profile: makeProfile({ handle: HANDLE }) });
    const { requireAuthedCreator } = await import("@/lib/auth/context");
    const res = await requireAuthedCreator(HANDLE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.context.profile.handle).toBe(HANDLE);
  });

  it("normalizes the path handle to lowercase before comparing", async () => {
    makeClient({ user: { id: USER_ID } as User, profile: makeProfile({ handle: "ada" }) });
    const { requireAuthedCreator } = await import("@/lib/auth/context");
    const res = await requireAuthedCreator("  ADA  ");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.context.profile.handle).toBe("ada");
  });
});
