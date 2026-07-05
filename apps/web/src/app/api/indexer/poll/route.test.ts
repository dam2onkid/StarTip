import { describe, it, expect, vi, beforeEach } from "vitest";

const processPoll = vi.fn();
vi.mock("@startip/shared/indexer/dispatch", () => ({ processPoll }));

vi.mock("@startip/shared/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({}) }),
}));

vi.mock("@startip/shared/stellar/server", () => ({
  rpc: {},
}));

vi.mock("@startip/shared/stellar/token", () => ({
  readTokenMetadata: vi.fn(),
}));

vi.mock("@/lib/stellar/client", () => ({
  contractId: "C-TEST-CONTRACT",
  networkPassphrase: "Test SDF Network ; September 2015",
}));

vi.mock("@/lib/env", () => ({
  env: { INDEXER_START_LEDGER: 0 },
}));

describe("POST /api/indexer/poll", () => {
  beforeEach(() => {
    processPoll.mockReset();
  });

  it("returns 200 with the processPoll summary on success", async () => {
    processPoll.mockResolvedValue({ processed: 3, lastLedger: 42, cursor: "next" });
    const { POST } = await import("@/app/api/indexer/poll/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 3, last_ledger: 42, cursor: "next" });
    expect(processPoll).toHaveBeenCalledTimes(1);
    const deps = processPoll.mock.calls[0][0] as { contractId: string; tokenReader: unknown; startLedger?: number };
    expect(deps.contractId).toBe("C-TEST-CONTRACT");
    expect(typeof deps.tokenReader).toBe("function");
    expect(deps.startLedger).toBe(0);
  });

  it("returns 500 with an error message when processPoll throws", async () => {
    processPoll.mockRejectedValue(new Error("rpc down"));
    const { POST } = await import("@/app/api/indexer/poll/route");
    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "rpc down" });
  });
});
