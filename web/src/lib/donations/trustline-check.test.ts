// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * lib/donations/trustline-check — client-side donor trustline lookup. The
 * donate form calls `donorHasTrustline` to decide whether the selected
 * non-native token needs a `change_trust` op. Native XLM short-circuits to
 * `true`; the Playwright E2E seam (`__STARTIP_DONATE_STUB__.checkTrustline`)
 * overrides the lookup so the two-op path can be exercised without a real
 * Soroban RPC account; otherwise the real `rpc.getAssetBalance` is queried.
 */

const DONOR = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";
const USDC_ISSUER = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

const USDC = { contract_address: "CUSDCONTRACT", symbol: "USDC", issuer: USDC_ISSUER };
const NATIVE_XLM = {
  contract_address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  symbol: "XLM",
  issuer: null,
};

type RpcLike = Pick<StellarSdk.rpc.Server, "getAssetBalance">;

function makeRpc(getAssetBalance: ReturnType<typeof vi.fn>): RpcLike {
  return { getAssetBalance } as unknown as RpcLike;
}

describe("donorHasTrustline", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    // By default `window` exists (as in the browser) but has no donate stub,
    // so the real `rpc.getAssetBalance` path is exercised.
    (globalThis as unknown as { window: unknown }).window = {};
  });

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  it("returns true for native XLM without any RPC call", async () => {
    const getAssetBalance = vi.fn();
    const { donorHasTrustline } = await import("./trustline-check");
    const result = await donorHasTrustline(makeRpc(getAssetBalance), DONOR, NATIVE_XLM);
    expect(result).toBe(true);
    expect(getAssetBalance).not.toHaveBeenCalled();
  });

  it("delegates to the __STARTIP_DONATE_STUB__.checkTrustline seam when present", async () => {
    const getAssetBalance = vi.fn();
    const checkTrustline = vi.fn(async (_args: { donorAddress: string; token: typeof USDC }) => false);
    (globalThis.window as unknown as Record<string, unknown>).__STARTIP_DONATE_STUB__ = {
      checkTrustline,
    };
    const { donorHasTrustline } = await import("./trustline-check");
    const result = await donorHasTrustline(makeRpc(getAssetBalance), DONOR, USDC);
    expect(result).toBe(false);
    expect(checkTrustline).toHaveBeenCalledOnce();
    expect(checkTrustline.mock.calls[0][0]).toMatchObject({
      donorAddress: DONOR,
      token: USDC,
    });
    // The real RPC is never hit when the stub overrides the check.
    expect(getAssetBalance).not.toHaveBeenCalled();
  });

  it("returns true when getAssetBalance reports a balance entry", async () => {
    const getAssetBalance = vi.fn<
      (address: string, asset: StellarSdk.Asset) => Promise<StellarSdk.rpc.Api.BalanceResponse>
    >(async () => ({
      latestLedger: 1,
      balanceEntry: { amount: "1000000", authorized: true, clawback: false },
    }));
    const { donorHasTrustline } = await import("./trustline-check");
    const result = await donorHasTrustline(makeRpc(getAssetBalance), DONOR, USDC);
    expect(result).toBe(true);
    expect(getAssetBalance).toHaveBeenCalledOnce();
    const asset = getAssetBalance.mock.calls[0][1];
    expect(asset.code).toBe("USDC");
    expect(asset.issuer).toBe(USDC_ISSUER);
  });

  it("returns false when getAssetBalance reports no balance entry", async () => {
    const getAssetBalance = vi.fn(async () => ({ latestLedger: 1 }));
    const { donorHasTrustline } = await import("./trustline-check");
    const result = await donorHasTrustline(makeRpc(getAssetBalance), DONOR, USDC);
    expect(result).toBe(false);
  });

  it("returns false when getAssetBalance throws (account / asset not found)", async () => {
    const getAssetBalance = vi.fn(async () => {
      throw new Error("Account not found");
    });
    const { donorHasTrustline } = await import("./trustline-check");
    const result = await donorHasTrustline(makeRpc(getAssetBalance), DONOR, USDC);
    expect(result).toBe(false);
  });

  it("returns false for a non-native token with no recorded issuer", async () => {
    const getAssetBalance = vi.fn();
    const { donorHasTrustline } = await import("./trustline-check");
    const noIssuer = { contract_address: "CUSDCONTRACT", symbol: "USDC", issuer: null };
    const result = await donorHasTrustline(makeRpc(getAssetBalance), DONOR, noIssuer);
    expect(result).toBe(false);
    expect(getAssetBalance).not.toHaveBeenCalled();
  });
});
