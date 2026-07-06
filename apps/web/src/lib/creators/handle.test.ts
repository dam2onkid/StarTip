// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  normalizeHandle,
  handleHashBuffer,
  handleHashHex,
  checkHandleAvailability,
  readCreatorOnChain,
} from "@/lib/creators/handle";

const CONTRACT_ID = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";

describe("normalizeHandle", () => {
  it("lowercases and trims the handle", () => {
    expect(normalizeHandle("  Ada  ").value).toBe("ada");
  });

  it("accepts alphanumeric, hyphens, and underscores within length limits", () => {
    expect(normalizeHandle("ada-lovelace_99").ok).toBe(true);
    expect(normalizeHandle("a".repeat(32)).ok).toBe(true);
  });

  it("rejects empty / whitespace-only handles", () => {
    expect(normalizeHandle("").ok).toBe(false);
    expect(normalizeHandle("   ").ok).toBe(false);
  });

  it("rejects handles shorter than 3 or longer than 32 characters", () => {
    expect(normalizeHandle("ab").ok).toBe(false);
    expect(normalizeHandle("a".repeat(33)).ok).toBe(false);
  });

  it("rejects handles with disallowed characters", () => {
    expect(normalizeHandle("ada lovelace").ok).toBe(false);
    expect(normalizeHandle("ada!").ok).toBe(false);
    expect(normalizeHandle("ada.lov").ok).toBe(false);
  });
});

describe("handleHashBuffer / handleHashHex", () => {
  it("produces a 32-byte sha256 of the normalized handle", () => {
    const buf = handleHashBuffer("Ada");
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(32);
    // Deterministic and based on the lowercased handle.
    expect(buf.equals(handleHashBuffer("ada"))).toBe(true);
  });

  it("handleHashHex is the lowercase hex of the buffer", () => {
    const buf = handleHashBuffer("ada");
    expect(handleHashHex("ada")).toBe(buf.toString("hex"));
    expect(handleHashHex("ada")).toMatch(/^[0-9a-f]{64}$/);
  });
});

/** Build an Option<Creator> retval: an empty vec for None, a 1-el vec for Some. */
function optionRetVal(some: boolean): StellarSdk.xdr.ScVal {
  if (!some) return StellarSdk.xdr.ScVal.scvVec([]);
  return StellarSdk.xdr.ScVal.scvVec([
    StellarSdk.xdr.ScVal.scvMap([
      new StellarSdk.xdr.ScMapEntry({
        key: StellarSdk.xdr.ScVal.scvSymbol("owner"),
        val: StellarSdk.Address.fromString(
          "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
        ).toScVal(),
      }),
    ]),
  ]);
}

/**
 * Build a bare-map Option<Creator> retval (the shape the production RPC
 * returns via `scValToNative`): `scvMap` directly, not wrapped in `scvVec`.
 */
function objectRetVal(): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvMap([
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("owner"),
      val: StellarSdk.Address.fromString(
        "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
      ).toScVal(),
    }),
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("payout_address"),
      val: StellarSdk.Address.fromString(
        "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
      ).toScVal(),
    }),
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("active"),
      val: StellarSdk.xdr.ScVal.scvBool(true),
    }),
  ]);
}

function mockRpc(some: boolean) {
  return {
    simulateTransaction: vi.fn(async () => ({
      id: "sim-1",
      latestLedger: 100,
      original: "",
      events: [],
      result: { retval: optionRetVal(some) },
    })),
  };
}

function mockSupabase(existingHandle: string | null) {
  const from = vi.fn((table: string) => {
    if (table !== "profiles") throw new Error(`unexpected table ${table}`);
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: existingHandle ? { handle: existingHandle } : null,
        error: null,
      })),
    };
    return chain;
  });
  return { from };
}

describe("checkHandleAvailability", () => {
  it("returns available when off-chain and on-chain are both free", async () => {
    const res = await checkHandleAvailability({
      supabase: mockSupabase(null) as never,
      rpc: mockRpc(false) as never,
      contractId: CONTRACT_ID,
      handle: "fresh",
    });
    expect(res).toEqual({ available: true });
  });

  it("returns offchain_taken when the profiles table already has the handle", async () => {
    const res = await checkHandleAvailability({
      supabase: mockSupabase("ada") as never,
      rpc: mockRpc(false) as never,
      contractId: CONTRACT_ID,
      handle: "ada",
    });
    expect(res.available).toBe(false);
    expect(res.reason).toBe("offchain_taken");
  });

  it("returns onchain_taken when get_creator returns Some", async () => {
    const res = await checkHandleAvailability({
      supabase: mockSupabase(null) as never,
      rpc: mockRpc(true) as never,
      contractId: CONTRACT_ID,
      handle: "ada",
    });
    expect(res.available).toBe(false);
    expect(res.reason).toBe("onchain_taken");
  });

  it("prefers the off-chain check result when both are taken", async () => {
    const res = await checkHandleAvailability({
      supabase: mockSupabase("ada") as never,
      rpc: mockRpc(true) as never,
      contractId: CONTRACT_ID,
      handle: "ada",
    });
    expect(res.available).toBe(false);
    expect(res.reason).toBe("offchain_taken");
  });
});

describe("readCreatorOnChain", () => {
  function mockRpcWith(retval: StellarSdk.xdr.ScVal) {
    return {
      simulateTransaction: vi.fn(async () => ({
        id: "sim-1",
        latestLedger: 100,
        original: "",
        events: [],
        result: { retval },
      })),
    };
  }

  it("returns null when get_creator returns None (empty vec)", async () => {
    const res = await readCreatorOnChain({
      rpc: mockRpcWith(optionRetVal(false)) as never,
      contractId: CONTRACT_ID,
      handle: "ada",
    });
    expect(res).toBeNull();
  });

  it("decodes the array-wrapped Some form (scvVec([scvMap]))", async () => {
    const res = await readCreatorOnChain({
      rpc: mockRpcWith(optionRetVal(true)) as never,
      contractId: CONTRACT_ID,
      handle: "ada",
    });
    expect(res).not.toBeNull();
    expect(res?.owner).toBe(
      "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
    );
  });

  it("decodes the bare-object Some form (scvMap) the production RPC returns", async () => {
    const res = await readCreatorOnChain({
      rpc: mockRpcWith(objectRetVal()) as never,
      contractId: CONTRACT_ID,
      handle: "ada",
    });
    expect(res).not.toBeNull();
    expect(res).toEqual({
      owner: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
      payout_address: "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA",
      active: true,
    });
  });

  it("returns null for an invalid handle without hitting the RPC", async () => {
    const rpc = { simulateTransaction: vi.fn() };
    const res = await readCreatorOnChain({
      rpc: rpc as never,
      contractId: CONTRACT_ID,
      handle: "x",
    });
    expect(res).toBeNull();
    expect(rpc.simulateTransaction).not.toHaveBeenCalled();
  });
});
