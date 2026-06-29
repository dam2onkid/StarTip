import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

function notImplemented(res: Response) {
  expect(res.status).toBe(501);
  expect(res.headers.get("content-type")).toContain("application/json");
}

describe("api route stubs", () => {
  it("POST /api/creators returns 501 { error: 'not_implemented' }", async () => {
    const { POST } = await import("@/app/api/creators/route");
    const res = await POST();
    notImplemented(res);
    expect(await res.json()).toEqual({ error: "not_implemented" });
  });

  it("POST /api/wallet/link returns 501 { error: 'not_implemented' }", async () => {
    const { POST } = await import("@/app/api/wallet/link/route");
    const res = await POST();
    notImplemented(res);
    expect(await res.json()).toEqual({ error: "not_implemented" });
  });

  it("POST /api/wallet/link/challenge returns 501 { error: 'not_implemented' }", async () => {
    const { POST } = await import("@/app/api/wallet/link/challenge/route");
    const res = await POST();
    notImplemented(res);
    expect(await res.json()).toEqual({ error: "not_implemented" });
  });

  it("POST /api/donations/prepare returns 501 { error: 'not_implemented' }", async () => {
    const { POST } = await import("@/app/api/donations/prepare/route");
    const res = await POST();
    notImplemented(res);
    expect(await res.json()).toEqual({ error: "not_implemented" });
  });

  it("POST /api/donations/confirm returns 501 { error: 'not_implemented' }", async () => {
    const { POST } = await import("@/app/api/donations/confirm/route");
    const res = await POST();
    notImplemented(res);
    expect(await res.json()).toEqual({ error: "not_implemented" });
  });

  it("POST /api/indexer/poll returns 501 { error: 'not_implemented' }", async () => {
    const { POST } = await import("@/app/api/indexer/poll/route");
    const res = await POST();
    notImplemented(res);
    expect(await res.json()).toEqual({ error: "not_implemented" });
  });

  it("GET /api/creators/[handle] returns 501 { error: 'not_implemented' }", async () => {
    const { GET } = await import("@/app/api/creators/[handle]/route");
    const req = new NextRequest("http://localhost/api/creators/somehandle");
    const res = await GET(req, { params: Promise.resolve({ handle: "somehandle" }) });
    notImplemented(res);
    expect(await res.json()).toEqual({ error: "not_implemented" });
  });
});
