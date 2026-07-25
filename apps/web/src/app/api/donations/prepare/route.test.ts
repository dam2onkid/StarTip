// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/donations/prepare — public endpoint that creates a single-use,
 * expiring Effect Intent before the donor signs the on-chain donation.
 *
 * Tests cover validation, Default Pack binding, donation preparation identity
 * generation, and worker error forwarding.
 */

const PREP_ID = "00000000-0000-0000-0000-000000000001";
const PREPARE_URL = "/api/donations/prepare";

function postReq(body: unknown) {
  return new NextRequest(`http://localhost${PREPARE_URL}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/donations/prepare", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("crypto", { randomUUID: () => PREP_ID });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 invalid_body when the request body is not valid JSON", async () => {
    const { POST } = await import("./route");
    const req = new NextRequest(`http://localhost${PREPARE_URL}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 400 missing_handle when handle is absent", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({ token: "CUSDC", amount: "2", effect_id: "jump-scare" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_handle" });
  });

  it("returns 400 missing_token when token is absent", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({ handle: "ada", amount: "2", effect_id: "jump-scare" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_token" });
  });

  it("returns 400 missing_effect_id when effect_id is absent", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({ handle: "ada", token: "CUSDC", amount: "2" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_effect_id" });
  });

  it("returns 400 invalid_effect for an unknown effect id", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({ handle: "ada", token: "CUSDC", amount: "2", effect_id: "disco-ball" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_effect" });
  });

  it("returns 400 invalid_amount when amount is not a positive number", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({ handle: "ada", token: "CUSDC", amount: "abc", effect_id: "jump-scare" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_amount" });
  });

  it("creates an Effect Intent through the worker with the Default Pack and a generated prep id", async () => {
    const fetchMock = vi.fn(async () =>
      jsonRes(201, { effect_intent_id: "ei-1", raw_amount: "2000000", expires_at: "2026-07-25T18:00:00Z" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const res = await POST(postReq({ handle: "Ada", token: "CUSDC", amount: "2", effect_id: "jump-scare" }));

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.donation_prep_id).toBe(PREP_ID);
    expect(body.effect_id).toBe("jump-scare");
    expect(body.pack_id).toBe("startip.default");
    expect(body.pack_version).toBe("1.0.0");
    expect(body.raw_amount).toBe("2000000");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const workerBody = JSON.parse(init.body as string);
    expect(workerBody.handle).toBe("ada");
    expect(workerBody.token).toBe("CUSDC");
    expect(workerBody.amount).toBe("2");
    expect(workerBody.effect_id).toBe("jump-scare");
    expect(workerBody.pack_id).toBe("startip.default");
    expect(workerBody.pack_version).toBe("1.0.0");
    expect(workerBody.donation_prep_id).toBe(PREP_ID);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer dev-worker-secret");
  });

  it("forwards worker errors to the client", async () => {
    const fetchMock = vi.fn(async () => jsonRes(400, { error: "amount_below_price" }));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const res = await POST(postReq({ handle: "ada", token: "CUSDC", amount: "0.5", effect_id: "jump-scare" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "amount_below_price" });
  });
});
