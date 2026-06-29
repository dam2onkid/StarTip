// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * GET /api/creators/[handle] — public Creator profile. The route is a thin
 * wrapper around `getPublicProfile` (tested in
 * `lib/creators/public-profile.test.ts`); these tests cover the wrapper's
 * param unwrapping and response mapping. Supabase is mocked.
 */

const serviceFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: serviceFrom })),
}));

function profilesChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error }));
  return chain;
}

function req(handle: string) {
  return new NextRequest(`http://localhost/api/creators/${handle}`, {
    method: "GET",
  });
}

describe("GET /api/creators/[handle]", () => {
  beforeEach(() => {
    serviceFrom.mockReset();
  });

  it("returns 200 with the public profile for a registered creator", async () => {
    serviceFrom.mockImplementation(() =>
      profilesChain({
        handle: "ada",
        display_name: "Ada Lovelace",
        avatar_url: null,
        bio: "Pioneer programmer.",
        onchain_registered: true,
      }),
    );
    const { GET } = await import("@/app/api/creators/[handle]/route");
    const res = await GET(req("ada"), { params: Promise.resolve({ handle: "ada" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      handle: "ada",
      display_name: "Ada Lovelace",
      avatar_url: null,
      bio: "Pioneer programmer.",
      onchain_registered: true,
    });
  });

  it("returns 404 creator_not_found when the view has no row", async () => {
    serviceFrom.mockImplementation(() => profilesChain(null));
    const { GET } = await import("@/app/api/creators/[handle]/route");
    const res = await GET(req("ghost"), { params: Promise.resolve({ handle: "ghost" }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "creator_not_found" });
  });

  it("returns 500 db_error when the query errors", async () => {
    serviceFrom.mockImplementation(() => profilesChain(null, { message: "boom" }));
    const { GET } = await import("@/app/api/creators/[handle]/route");
    const res = await GET(req("ada"), { params: Promise.resolve({ handle: "ada" }) });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db_error" });
  });

  it("unwraps the promised params handle before querying", async () => {
    serviceFrom.mockImplementation(() =>
      profilesChain({
        handle: "ada",
        display_name: "Ada",
        avatar_url: null,
        bio: null,
        onchain_registered: true,
      }),
    );
    const { GET } = await import("@/app/api/creators/[handle]/route");
    await GET(req("ada"), { params: Promise.resolve({ handle: "Ada" }) });
    // The route awaited params and passed the raw handle to getPublicProfile,
    // which lowercased it. The eq filter recorded the lowercased value.
    const chain = serviceFrom.mock.results[0].value as { eq: { mock: { calls: unknown[][] } } };
    expect(chain.eq.mock.calls[0][1]).toBe("ada");
  });
});
