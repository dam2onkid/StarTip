import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

function notImplemented(res: Response) {
  expect(res.status).toBe(501);
  expect(res.headers.get("content-type")).toContain("application/json");
}

describe("api route stubs", () => {
  it("GET /api/creators/[handle] returns 501 { error: 'not_implemented' }", async () => {
    const { GET } = await import("@/app/api/creators/[handle]/route");
    const req = new NextRequest("http://localhost/api/creators/somehandle");
    const res = await GET(req, { params: Promise.resolve({ handle: "somehandle" }) });
    notImplemented(res);
    expect(await res.json()).toEqual({ error: "not_implemented" });
  });
});
