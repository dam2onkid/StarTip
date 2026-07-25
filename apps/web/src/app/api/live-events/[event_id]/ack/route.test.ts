// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const WORKER_URL = "http://localhost:3101";
const WORKER_SECRET = "dev-worker-secret";
const EVENT_ID = "00000000-0000-0000-0000-000000000001";
const OVERLAY_ID = "ov-test";

vi.mock("@/lib/env", () => ({
  env: {
    WORKER_URL,
    WORKER_SECRET,
  },
}));

function postReq(body: unknown) {
  return new NextRequest(`http://localhost/api/live-events/${EVENT_ID}/ack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/live-events/[event_id]/ack", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("returns 400 invalid_body when the body is not valid JSON", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest(`http://localhost/api/live-events/${EVENT_ID}/ack`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
      { params: Promise.resolve({ event_id: EVENT_ID }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 400 invalid_body when overlay_id or status is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({}), { params: Promise.resolve({ event_id: EVENT_ID }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 400 invalid_body when status is not an allowed value", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      postReq({ overlay_id: OVERLAY_ID, status: "bogus" }),
      { params: Promise.resolve({ event_id: EVENT_ID }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("forwards the acknowledgement to the Worker with the secret", async () => {
    const fetchCalls: { url: string; init: RequestInit }[] = [];
    global.fetch = vi.fn(async (url, init) => {
      fetchCalls.push({ url: String(url), init: init as RequestInit });
      return new Response(JSON.stringify({ id: EVENT_ID, status: "started" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const { POST } = await import("./route");
    const res = await POST(
      postReq({ overlay_id: OVERLAY_ID, status: "started" }),
      { params: Promise.resolve({ event_id: EVENT_ID }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: EVENT_ID, status: "started" });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`${WORKER_URL}/live-events/${EVENT_ID}/ack`);
    expect(fetchCalls[0].init.method).toBe("POST");
    expect(fetchCalls[0].init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: `Bearer ${WORKER_SECRET}`,
    });
    expect(JSON.parse(fetchCalls[0].init.body as string)).toEqual({
      overlay_id: OVERLAY_ID,
      status: "started",
    });
  });

  it("returns 504 when the Worker is unreachable", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network error");
    }) as unknown as typeof fetch;

    const { POST } = await import("./route");
    const res = await POST(
      postReq({ overlay_id: OVERLAY_ID, status: "completed" }),
      { params: Promise.resolve({ event_id: EVENT_ID }) },
    );
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "ack_unavailable" });
  });
});
