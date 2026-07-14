// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/tts - public proxy from the Overlay to the Worker's synthesize
 * endpoint. Resolves the overlay_id to a registered, not-paused Creator, checks
 * a per-overlay_id rate limit, attaches the Worker secret, and forwards the
 * text + voice. Audio bytes and Worker errors are passed through unchanged.
 */

const WORKER_URL = "http://localhost:3101";
const WORKER_SECRET = "dev-worker-secret";
const CREATOR_PROFILE_ID = "11111111-1111-1111-1111-111111111111";

const serviceFrom = vi.fn();

vi.mock("@/lib/env", () => ({
  env: {
    WORKER_URL,
    WORKER_SECRET,
    TTS_RATE_LIMIT_MAX_REQUESTS: 2,
    TTS_RATE_LIMIT_WINDOW_MS: 60_000,
  },
}));

vi.mock("@startip/shared/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: serviceFrom })),
}));

/** A profiles select chain that resolves maybeSingle to `data`. */
function profilesSelectChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error }));
  return chain;
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    overlay_id: "abc123",
    text: "Hello",
    voice: "en-US-EmmaNeural",
    ...overrides,
  };
}

describe("POST /api/tts", () => {
  beforeEach(() => {
    vi.resetModules();
    serviceFrom.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns 400 invalid_body when the body is not valid JSON", async () => {
    const { POST } = await import("@/app/api/tts/route");
    const res = await POST(
      new NextRequest("http://localhost/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 400 invalid_body when overlay_id, text, or voice is missing or empty", async () => {
    const { POST } = await import("@/app/api/tts/route");

    const missingOverlayId = await POST(
      postReq(validBody({ overlay_id: undefined })),
    );
    expect(missingOverlayId.status).toBe(400);
    expect(await missingOverlayId.json()).toEqual({ error: "invalid_body" });

    const missingText = await POST(
      postReq(validBody({ text: undefined })),
    );
    expect(missingText.status).toBe(400);
    expect(await missingText.json()).toEqual({ error: "invalid_body" });

    const missingVoice = await POST(
      postReq(validBody({ voice: undefined })),
    );
    expect(missingVoice.status).toBe(400);
    expect(await missingVoice.json()).toEqual({ error: "invalid_body" });

    const emptyOverlayId = await POST(
      postReq(validBody({ overlay_id: "   " })),
    );
    expect(emptyOverlayId.status).toBe(400);
    expect(await emptyOverlayId.json()).toEqual({ error: "invalid_body" });

    const emptyText = await POST(
      postReq(validBody({ text: "" })),
    );
    expect(emptyText.status).toBe(400);
    expect(await emptyText.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 404 creator_not_found for an unknown overlay_id", async () => {
    serviceFrom.mockImplementationOnce(() => profilesSelectChain(null));
    const { POST } = await import("@/app/api/tts/route");
    const res = await POST(
      postReq(validBody({ overlay_id: "unknown" })),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "creator_not_found" });
  });

  it("returns 404 creator_not_found when the Creator is not registered or is paused", async () => {
    const { POST } = await import("@/app/api/tts/route");

    serviceFrom.mockImplementationOnce(() =>
      profilesSelectChain({
        id: CREATOR_PROFILE_ID,
        onchain_registered: false,
        paused: false,
      }),
    );
    const notRegistered = await POST(
      postReq(validBody()),
    );
    expect(notRegistered.status).toBe(404);
    expect(await notRegistered.json()).toEqual({ error: "creator_not_found" });

    serviceFrom.mockImplementationOnce(() =>
      profilesSelectChain({
        id: CREATOR_PROFILE_ID,
        onchain_registered: true,
        paused: true,
      }),
    );
    const paused = await POST(
      postReq(validBody()),
    );
    expect(paused.status).toBe(404);
    expect(await paused.json()).toEqual({ error: "creator_not_found" });
  });

  it("returns 500 db_error when the profile read fails", async () => {
    serviceFrom.mockImplementationOnce(() =>
      profilesSelectChain(null, { message: "boom" }),
    );
    const { POST } = await import("@/app/api/tts/route");
    const res = await POST(
      postReq(validBody()),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db_error" });
  });

  it("forwards to the Worker synthesize endpoint with the secret and payload", async () => {
    serviceFrom.mockImplementationOnce(() =>
      profilesSelectChain({
        id: CREATOR_PROFILE_ID,
        onchain_registered: true,
        paused: false,
      }),
    );

    const fetchCalls: { url: string; init: RequestInit }[] = [];
    const fakeAudio = new Uint8Array([1, 2, 3]);
    global.fetch = vi.fn(async (url, init) => {
      fetchCalls.push({ url: String(url), init: init as RequestInit });
      return new Response(fakeAudio, {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      });
    }) as unknown as typeof fetch;

    const { POST } = await import("@/app/api/tts/route");
    const res = await POST(
      postReq(validBody()),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(fakeAudio);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`${WORKER_URL}/tts`);
    expect(fetchCalls[0].init.method).toBe("POST");
    expect(fetchCalls[0].init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: `Bearer ${WORKER_SECRET}`,
    });
    expect(JSON.parse(fetchCalls[0].init.body as string)).toEqual({
      text: "Hello",
      voice: "en-US-EmmaNeural",
    });
  });

  it("trims the overlay_id before resolving and forwarding to the Worker", async () => {
    serviceFrom.mockImplementationOnce(() =>
      profilesSelectChain({
        id: CREATOR_PROFILE_ID,
        onchain_registered: true,
        paused: false,
      }),
    );
    global.fetch = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      }),
    ) as unknown as typeof fetch;

    const { POST } = await import("@/app/api/tts/route");
    const res = await POST(
      postReq(validBody({ overlay_id: "  abc123  " })),
    );
    expect(res.status).toBe(200);

    const profileChain = serviceFrom.mock.results[0].value as {
      eq: { mock: { calls: unknown[][] } };
    };
    expect(profileChain.eq.mock.calls[0][1]).toBe("abc123");
  });

  it("passes through a Worker error response unchanged", async () => {
    serviceFrom.mockImplementationOnce(() =>
      profilesSelectChain({
        id: CREATOR_PROFILE_ID,
        onchain_registered: true,
        paused: false,
      }),
    );
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "synthesis_failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const { POST } = await import("@/app/api/tts/route");
    const res = await POST(
      postReq(validBody()),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "synthesis_failed" });
  });

  it("rejects an unknown overlay_id before calling the Worker", async () => {
    serviceFrom.mockImplementationOnce(() => profilesSelectChain(null));
    const fetchCalls: { url: string }[] = [];
    global.fetch = vi.fn(async (url) => {
      fetchCalls.push({ url: String(url) });
      return new Response("should not be called", { status: 500 });
    }) as unknown as typeof fetch;

    const { POST } = await import("@/app/api/tts/route");
    const res = await POST(
      postReq(validBody({ overlay_id: "unknown" })),
    );
    expect(res.status).toBe(404);
    expect(fetchCalls).toHaveLength(0);
  });

  it("enforces the per-overlay_id rate limit and allows a different overlay_id", async () => {
    serviceFrom.mockImplementation(() =>
      profilesSelectChain({
        id: CREATOR_PROFILE_ID,
        onchain_registered: true,
        paused: false,
      }),
    );
    global.fetch = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      }),
    ) as unknown as typeof fetch;

    const { POST } = await import("@/app/api/tts/route");

    const first = await POST(
      postReq(validBody()),
    );
    expect(first.status).toBe(200);

    const second = await POST(
      postReq(validBody()),
    );
    expect(second.status).toBe(200);

    const third = await POST(
      postReq(validBody()),
    );
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: "rate_limited" });

    const other = await POST(
      postReq(validBody({ overlay_id: "xyz789" })),
    );
    expect(other.status).toBe(200);

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
