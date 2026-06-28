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

  it("redirects unauthenticated requests to (auth) routes to the login URL", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { updateSession, LOGIN_REDIRECT_URL } = await import(
      "@/lib/supabase/middleware"
    );
    const res = await updateSession(makeRequest("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain(LOGIN_REDIRECT_URL);
  });

  it("lets authenticated (auth) requests through without redirect", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    const { updateSession } = await import("@/lib/supabase/middleware");
    const res = await updateSession(makeRequest("/dashboard/profile"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not redirect unauthenticated requests to non-(auth) routes", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { updateSession } = await import("@/lib/supabase/middleware");
    const res = await updateSession(makeRequest("/"));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("middleware config matcher", () => {
  it("covers (auth) routes (/dashboard, /onboarding) and excludes api/, _next/, and static assets", async () => {
    const { config } = await import("@/lib/supabase/middleware");
    const matcher = config.matcher as string[];
    expect(matcher).toBeDefined();
    expect(matcher.length).toBeGreaterThan(0);
    // Next.js treats matcher entries as regex path patterns.
    function matches(pathname: string): boolean {
      return matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
    }
    expect(matches("/dashboard")).toBe(true);
    expect(matches("/dashboard/profile")).toBe(true);
    expect(matches("/onboarding")).toBe(true);
    expect(matches("/api/creators")).toBe(false);
    expect(matches("/_next/static/chunk.js")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
  });
});
