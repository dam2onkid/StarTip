import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const exchangeCodeForSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession },
  })),
}));

function makeRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("/auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
  });

  it("exchanges the code for a session and redirects to /dashboard when no next param", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
    const { GET } = await import("@/app/auth/callback/route");
    const res = await GET(makeRequest("http://localhost:3000/auth/callback?code=abc"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
  });

  it("redirects to next when next is present and not /login", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
    const { GET } = await import("@/app/auth/callback/route");
    const res = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=abc&next=/creator/explore"),
    );
    expect(new URL(res.headers.get("location")!).pathname).toBe("/creator/explore");
  });

  it("redirects to /dashboard when next is /login (prevents login redirect loop)", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
    const { GET } = await import("@/app/auth/callback/route");
    const res = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=abc&next=/login"),
    );
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
  });

  it("returns 400 when the code exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: new Error("bad") });
    const { GET } = await import("@/app/auth/callback/route");
    const res = await GET(makeRequest("http://localhost:3000/auth/callback?code=bad"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "code_exchange_failed" });
  });

  it("returns 400 when no code param is present", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const res = await GET(makeRequest("http://localhost:3000/auth/callback"));
    expect(res.status).toBe(400);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
