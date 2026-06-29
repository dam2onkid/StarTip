import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser },
  })),
}));

describe("supabase/middleware updateSession", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  function makeRequest(pathname: string) {
    return new NextRequest(new URL(pathname, "http://localhost:3000"));
  }

  it("redirects unauthenticated /dashboard requests to the login URL and forwards the original path as next", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { updateSession, LOGIN_REDIRECT_URL } = await import(
      "@/lib/supabase/middleware"
    );
    const res = await updateSession(makeRequest("/dashboard"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe(LOGIN_REDIRECT_URL);
    expect(location.searchParams.get("next")).toBe("/dashboard");
  });

  it("lets authenticated /dashboard requests through without redirect", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    const { updateSession } = await import("@/lib/supabase/middleware");
    const res = await updateSession(makeRequest("/dashboard"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not redirect unauthenticated requests to public routes", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { updateSession } = await import("@/lib/supabase/middleware");
    const publicPaths = [
      "/",
      "/login",
      "/creator/explore",
      "/creator/somehandle",
      "/creator/somehandle/donate",
      "/overlay/somehandle",
      "/docs",
    ];
    for (const pathname of publicPaths) {
      const res = await updateSession(makeRequest(pathname));
      expect(res.headers.get("location")).toBeNull();
    }
  });
});

describe("middleware config matcher", () => {
  it("covers /dashboard and excludes api/, _next/, static assets, and public routes are not gated by the matcher", async () => {
    const { config } = await import("@/lib/supabase/middleware");
    const matcher = config.matcher as string[];
    expect(matcher).toBeDefined();
    expect(matcher.length).toBeGreaterThan(0);
    // Next.js treats matcher entries as regex path patterns.
    function matches(pathname: string): boolean {
      return matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
    }
    // The matcher runs updateSession on every non-excluded path so the session
    // cookie can be refreshed on public routes too. The gating decision is made
    // inside updateSession, not by the matcher.
    expect(matches("/dashboard")).toBe(true);
    expect(matches("/login")).toBe(true);
    expect(matches("/creator/explore")).toBe(true);
    expect(matches("/creator/somehandle")).toBe(true);
    expect(matches("/overlay/somehandle")).toBe(true);
    expect(matches("/docs")).toBe(true);
    // Excluded: api/, _next/, static assets.
    expect(matches("/api/creators")).toBe(false);
    expect(matches("/_next/static/chunk.js")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
  });
});
