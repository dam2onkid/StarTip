// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * lib/donations/trustline — pure trustline decision logic for the donate form.
 * No RPC, no window globals, no side effects: every function is a pure function
 * of its inputs so it can be unit-tested and reused on both server and client.
 *
 * Tests cover:
 *   - NATIVE_XLM_SAC_CONTRACT_IDS / isNativeXlmSac for testnet + pubnet native XLM
 *   - needsTrustline: false for native XLM and for an existing trustline, true
 *     for a non-native token with no trustline
 *   - trustlineAsset: { code, issuer } for a credit asset, null for native / no issuer
 *   - buildChangeTrustOp: produces a valid ChangeTrust op XDR with the right
 *     asset code, issuer, source account, and max-int64 limit
 */

const DONOR = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";
const USDC_ISSUER = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";

const USDC = {
  contract_address: "CUSDCONTRACT",
  symbol: "USDC",
  issuer: USDC_ISSUER,
};

const NATIVE_XLM_TESTNET = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const NATIVE_XLM_PUBNET = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";

describe("NATIVE_XLM_SAC_CONTRACT_IDS / isNativeXlmSac", () => {
  it("recognizes the native XLM SAC contract on testnet and pubnet", async () => {
    const { isNativeXlmSac, NATIVE_XLM_SAC_CONTRACT_IDS } = await import("./trustline");
    expect(NATIVE_XLM_SAC_CONTRACT_IDS.has(NATIVE_XLM_TESTNET)).toBe(true);
    expect(NATIVE_XLM_SAC_CONTRACT_IDS.has(NATIVE_XLM_PUBNET)).toBe(true);
    expect(isNativeXlmSac(NATIVE_XLM_TESTNET)).toBe(true);
    expect(isNativeXlmSac(NATIVE_XLM_PUBNET)).toBe(true);
  });

  it("returns false for a non-native token contract address", async () => {
    const { isNativeXlmSac } = await import("./trustline");
    expect(isNativeXlmSac("CUSDCONTRACT")).toBe(false);
    expect(isNativeXlmSac("")).toBe(false);
  });
});

describe("needsTrustline", () => {
  it("returns false for native XLM regardless of the trustline flag", async () => {
    const { needsTrustline } = await import("./trustline");
    const native = { contract_address: NATIVE_XLM_TESTNET, symbol: "XLM", issuer: null };
    expect(needsTrustline(native, false)).toBe(false);
    expect(needsTrustline(native, true)).toBe(false);
  });

  it("returns false for a non-native token the Donor already has a trustline to", async () => {
    const { needsTrustline } = await import("./trustline");
    expect(needsTrustline(USDC, true)).toBe(false);
  });

  it("returns true for a non-native token the Donor lacks a trustline to", async () => {
    const { needsTrustline } = await import("./trustline");
    expect(needsTrustline(USDC, false)).toBe(true);
  });
});

describe("trustlineAsset", () => {
  it("returns { code, issuer } for a non-native credit asset", async () => {
    const { trustlineAsset } = await import("./trustline");
    expect(trustlineAsset(USDC)).toEqual({ code: "USDC", issuer: USDC_ISSUER });
  });

  it("returns null for native XLM and for a token with no recorded issuer", async () => {
    const { trustlineAsset } = await import("./trustline");
    const native = { contract_address: NATIVE_XLM_PUBNET, symbol: "XLM", issuer: null };
    expect(trustlineAsset(native)).toBeNull();
    const noIssuer = { contract_address: "CUSDCONTRACT", symbol: "USDC", issuer: null };
    expect(trustlineAsset(noIssuer)).toBeNull();
  });
});

describe("buildChangeTrustOp", () => {
  it("produces a valid ChangeTrust op XDR with the asset, source, and max limit", async () => {
    const { buildChangeTrustOp } = await import("./trustline");
    const op = buildChangeTrustOp(USDC, DONOR);

    // Operation body is a changeTrust.
    expect(op.body().switch().name).toBe("changeTrust");

    const ct = op.body().changeTrustOp();
    const line = ct.line();

    // 4-char code -> AlphaNum4.
    expect(line.switch().name).toBe("assetTypeCreditAlphanum4");
    const an4 = line.alphaNum4();
    expect(an4.assetCode().toString().replace(/\u0000/g, "")).toBe("USDC");
    expect(StellarSdk.StrKey.encodeEd25519PublicKey(an4.issuer().ed25519())).toBe(USDC_ISSUER);

    // Source account is the donor.
    expect(
      StellarSdk.StrKey.encodeEd25519PublicKey(op.sourceAccount()!.ed25519()),
    ).toBe(DONOR);

    // Default limit is max int64 (open-ended trustline).
    expect(ct.limit().toString()).toBe("9223372036854775807");

    // Round-trips through XDR.
    expect(typeof op.toXDR("base64")).toBe("string");
  });

  it("uses AlphaNum12 for a >4-char asset code", async () => {
    const { buildChangeTrustOp } = await import("./trustline");
    const token = { contract_address: "CLONGCODE", symbol: "EURCIRCLE", issuer: USDC_ISSUER };
    const op = buildChangeTrustOp(token, DONOR);
    const line = op.body().changeTrustOp().line();
    expect(line.switch().name).toBe("assetTypeCreditAlphanum12");
    expect(line.alphaNum12().assetCode().toString().replace(/\u0000/g, "")).toBe("EURCIRCLE");
  });

  it("throws for native XLM or a token with no issuer", async () => {
    const { buildChangeTrustOp } = await import("./trustline");
    const native = { contract_address: NATIVE_XLM_TESTNET, symbol: "XLM", issuer: null };
    expect(() => buildChangeTrustOp(native, DONOR)).toThrow();
    const noIssuer = { contract_address: "CUSDCONTRACT", symbol: "USDC", issuer: null };
    expect(() => buildChangeTrustOp(noIssuer, DONOR)).toThrow();
  });
});
