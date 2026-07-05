import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "@/lib/env";

const cookieStore = {
  getAll: vi.fn(() => [] as { name: string; value: string }[]),
  set: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStore),
}));

const createServerClientSpy = vi.fn();
const getSession = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => {
    createServerClientSpy(...args);
    return { auth: { getSession } };
  },
}));

describe("supabase/server", () => {
  beforeEach(() => {
    createServerClientSpy.mockClear();
    getSession.mockReset();
    cookieStore.getAll.mockClear();
    cookieStore.set.mockClear();
  });

  it("createServerClient is wired to the public URL and anon key", async () => {
    const { createServerClient } = await import("@/lib/supabase/server");
    await createServerClient();
    expect(createServerClientSpy).toHaveBeenCalledWith(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
  });

  it("createServerClient reads the auth session from next/headers cookies", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { createServerClient } = await import("@/lib/supabase/server");
    const client = await createServerClient();
    await client.auth.getSession();
    expect(getSession).toHaveBeenCalled();
    // The cookies adapter wired into the SSR client reads from the cookie store.
    const adapter = createServerClientSpy.mock.calls[0][2].cookies;
    expect(adapter.getAll()).toEqual([]);
  });
});
