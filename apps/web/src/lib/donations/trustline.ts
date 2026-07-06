import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * Pure trustline decision logic for the donate form (PRD issue 03: trustline
 * guidance). Before building `donate()`, the form checks whether the Donor's
 * wallet has a trustline to the selected non-native token. If not, it tells the
 * Donor and builds a two-op `change_trust` + `donate()` transaction to sign
 * once. The trustline step is skipped for native XLM and for any token the
 * Donor already holds a trustline to.
 *
 * This module is intentionally pure and client-safe: no `server-only`, no RPC,
 * no window globals, no side effects. Every function is a pure function of its
 * inputs so it can be unit-tested and reused on both the server (indexer) and
 * the client (donate form). The RPC lookup that determines `hasTrustline` lives
 * in `lib/donations/trustline-check.ts`; this module only decides what to do
 * with that boolean.
 */

/**
 * The SAC contract addresses for native XLM. These are deterministic: each is
 * derived from the network passphrase and the native-asset contract-id
 * preimage, so they are fixed per network and never change. Native XLM never
 * needs a trustline (every funded account has an XLM balance), so the form
 * skips the trustline step for these addresses.
 *
 * Kept as a set so `isNativeXlmSac` is an O(1) lookup that does not allocate.
 */
export const NATIVE_XLM_SAC_CONTRACT_IDS: ReadonlySet<string> = new Set([
  // Testnet (StellarSdk.Networks.TESTNET)
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  // Pubnet (StellarSdk.Networks.PUBLIC)
  "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
]);

/**
 * The subset of a token-allowlist entry the trustline logic needs. Structurally
 * compatible with `TokenAllowlistEntry` from `lib/donations/token`, so the
 * donate form can pass its selected token entry directly. `issuer` is nullable
 * because native XLM has no issuer and some SAC interfaces do not expose one.
 */
export interface TrustlineToken {
  /** SAC contract address (`C...`). */
  contract_address: string;
  /** Asset code, e.g. "USDC". The classic-asset code for `change_trust`. */
  symbol: string;
  /** Classic asset issuer (`G...`). `null` for native XLM. */
  issuer: string | null;
}

/**
 * `true` when `contractAddress` is the native XLM SAC contract on either
 * network. Native XLM never needs a trustline, so the form uses this to short-
 * circuit the trustline check and skip the `change_trust` step.
 */
export function isNativeXlmSac(contractAddress: string): boolean {
  return NATIVE_XLM_SAC_CONTRACT_IDS.has(contractAddress);
}

/**
 * Decide whether the donate flow needs to prepend a `change_trust` op.
 *
 * Returns `false` for native XLM (every funded account holds XLM) and for a
 * non-native token the Donor already has a trustline to. Returns `true` only
 * for a non-native token the Donor lacks a trustline to.
 *
 * @param token        the selected allowlist token.
 * @param hasTrustline whether the Donor's wallet currently holds a trustline to
 *                     `token` (determined out-of-band via RPC; see
 *                     `trustline-check.ts`).
 */
export function needsTrustline(token: TrustlineToken, hasTrustline: boolean): boolean {
  if (isNativeXlmSac(token.contract_address)) return false;
  return !hasTrustline;
}

/**
 * The classic `{ code, issuer }` asset pair a `change_trust` op targets for a
 * SAC token, or `null` when no trustline can be built (native XLM, or a token
 * whose issuer was not recorded by the indexer).
 */
export function trustlineAsset(
  token: TrustlineToken,
): { code: string; issuer: string } | null {
  if (isNativeXlmSac(token.contract_address)) return null;
  if (!token.issuer) return null;
  return { code: token.symbol, issuer: token.issuer };
}

/**
 * Build a `change_trust` operation that establishes an open-ended trustline to
 * `token`'s classic asset, sourced from the Donor. The donate flow prepends
 * this op ahead of `donate()` in a single transaction the Donor signs once.
 *
 * Throws when no trustline can be built (native XLM or a missing issuer), since
 * the caller is expected to have already gated on `needsTrustline`.
 */
export function buildChangeTrustOp(
  token: TrustlineToken,
  donorAddress: string,
): StellarSdk.xdr.Operation {
  const asset = trustlineAsset(token);
  if (!asset) {
    throw new Error(
      `Cannot build change_trust for token ${token.contract_address}: ` +
        `native XLM or missing issuer`,
    );
  }
  return StellarSdk.Operation.changeTrust({
    asset: new StellarSdk.Asset(asset.code, asset.issuer),
    source: donorAddress,
  });
}
