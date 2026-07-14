// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { authError, authContext } from "@/lib/auth/test-helpers";

/**
 * GET /api/tts/voices - authenticated proxy to the Worker's voice list.
 * Tests assert that the route attaches the Worker secret, forwards the locale
 * query, and passes through the Worker response.
 */

const WORKER_URL = "http://localhost:3101";
const WORKER_SECRET = "dev-worker-secret";

const requireAuthedProfileMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/context", () => ({
  requireAuthedProfile: requireAuthedProfileMock,
}));

vi.mock("@/lib/env", () => ({
  env: { WORKER_URL, WORKER_SECRET },
}));

function getReq(locale?: string) {
  const url =
    locale !== undefined
      ? `http://localhost/api/tts/voices?locale=${encodeURIComponent(locale)}`
      : "http://localhost/api/tts/voices";
  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/tts/voices", () => {
  beforeEach(() => {
    requireAuthedProfileMock.mockReset();
    vi.unstubAllGlobals();
    requireAuthedProfileMock.mockResolvedValue(
      authContext({ id: "p1", user_id: "u1", handle: "ada" }),
    );
  });

  it("returns 401 when the caller is not authenticated", async () => {
    requireAuthedProfileMock.mockResolvedValue(authError("unauthorized", 401));
    const { GET } = await import("@/app/api/tts/voices/route");
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("forwards to the Worker voices endpoint with the secret", async () => {
    const fetchCalls: { url: string; init: RequestInit }[] = [];
    global.fetch = vi.fn(async (url, init) => {
      fetchCalls.push({ url: String(url), init: init as RequestInit });
      return new Response(JSON.stringify({ voices: [{ id: "en-US-EmmaNeural" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const { GET } = await import("@/app/api/tts/voices/route");
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voices: [{ id: "en-US-EmmaNeural" }] });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`${WORKER_URL}/tts/voices`);
    expect(fetchCalls[0].init.headers).toMatchObject({
      authorization: `Bearer ${WORKER_SECRET}`,
    });
  });

  it("forwards the locale query parameter to the Worker", async () => {
    const fetchCalls: { url: string }[] = [];
    global.fetch = vi.fn(async (url) => {
      fetchCalls.push({ url: String(url) });
      return new Response(JSON.stringify({ voices: [{ id: "en-US-EmmaNeural" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const { GET } = await import("@/app/api/tts/voices/route");
    const res = await GET(getReq("en-US"));
    expect(res.status).toBe(200);
    expect(fetchCalls[0].url).toBe(`${WORKER_URL}/tts/voices?locale=en-US`);
  });

  it("passes through a Worker error response", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "voices_failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const { GET } = await import("@/app/api/tts/voices/route");
    const res = await GET(getReq());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "voices_failed" });
  });

  it("returns 504 when the Worker request times out or fails", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network error");
    }) as unknown as typeof fetch;

    const { GET } = await import("@/app/api/tts/voices/route");
    const res = await GET(getReq());
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "voices_unavailable" });
  });
});
