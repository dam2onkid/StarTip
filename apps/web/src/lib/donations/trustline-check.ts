import * as StellarSdk from "@stellar/stellar-sdk";
import { isNativeXlmSac, type TrustlineToken } from "@/lib/donations/trustline";

/**
 * Client-side donor trustline lookup (PRD issue 03: trustline guidance). The
 * donate form calls `donorHasTrustline` before building `donate()` to decide
 * whether a `change_trust` op is needed.
 *
 * This module is client-safe (no `server-only`): the donate form runs in the
 * browser. The lookup short-circuits to `true` for native XLM, delegates to the
 * optional `__STARTIP_DONATE_STUB__.checkTrustline` E2E seam when present, and
 * otherwise queries `rpc.getAssetBalance` for the classic asset behind the SAC
 * token. A missing balance entry, a missing issuer, or an RPC error all map to
 * `false` (no trustline), so the form shows the trustline guidance and builds
 * the two-op path.
 */

/** The subset of a Soroban RPC server needed to look up a trustline balance. */
export type TrustlineRpc = Pick<StellarSdk.rpc.Server, "getAssetBalance">;

/**
 * Returns `true` when the Donor's wallet holds a trustline (or balance) to the
 * selected token, `false` when it does not (or when it cannot be determined).
 *
 * - Native XLM (`isNativeXlmSac`): always `true`; no RPC call is made.
 * - A non-native token with no recorded issuer: `false`; a classic trustline
 *   cannot be built without the issuer, so the form shows the guidance.
 * - Otherwise: delegate to `__STARTIP_DONATE_STUB__.checkTrustline` when the
 *   E2E seam is present, else query `rpc.getAssetBalance` for the classic
 *   `{ code, issuer }` asset and treat any present `balanceEntry` as a
 *   trustline.
 */
export async function donorHasTrustline(
  rpc: TrustlineRpc,
  donorAddress: string,
  token: TrustlineToken,
): Promise<boolean> {
  // Native XLM never needs a trustline.
  if (isNativeXlmSac(token.contract_address)) return true;

  // A classic trustline is keyed by (code, issuer); without the issuer there
  // is nothing to look up.
  if (!token.issuer) return false;

  // E2E seam: the Playwright harness overrides the lookup so the two-op path
  // can be exercised without a real RPC account.
  const stub =
    typeof window !== "undefined" ? window.__STARTIP_DONATE_STUB__ : undefined;
  if (stub?.checkTrustline) {
    return stub.checkTrustline({ donorAddress, token });
  }

  try {
    const asset = new StellarSdk.Asset(token.symbol, token.issuer);
    const balance = await rpc.getAssetBalance(donorAddress, asset);
    return Boolean(balance?.balanceEntry);
  } catch {
    // Account not found, asset not found, or RPC error: treat as no trustline
    // so the form shows the guidance and builds the two-op path.
    return false;
  }
}
