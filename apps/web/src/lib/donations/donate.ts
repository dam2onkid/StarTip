import * as StellarSdk from "@stellar/stellar-sdk";
import { buildChangeTrustOp, type TrustlineToken } from "@/lib/donations/trustline";
import {
  invokeDonationRouter,
  InvocationError,
} from "@/lib/stellar/donation-router-invocation";

/**
 * Client-side donate transaction pipeline. The Donor builds, signs, and
 * submits `donate(donor, creator_id_hash, token, amount)` directly to Soroban
 * RPC from `/creator/[handle]/donate` (ADR-0002: the wallet owns the on-chain
 * signature; the server never sees the secret key). The server only mirrors
 * the resulting `DonationReceived` event via the indexer and the verify fast
 * path.
 *
 * The actual load/simulate/assemble/sign/submit lifecycle lives in
 * `lib/stellar/donation-router-invocation`; this module is a thin wrapper
 * that builds the donate args (and optional `change_trust` pre-operation) and
 * maps `InvocationError` codes to domain-specific `DonateError` codes.
 *
 * Test seam: when `window.__STARTIP_DONATE_STUB__` is present (injected by the
 * Playwright E2E harness), `donateOnChain` delegates to it instead of building
 * and submitting a real transaction. This avoids mocking the full Soroban
 * JSON-RPC surface in E2E.
 */

/** Typed contract error codes from `donation-router/src/lib.rs`. */
export type DonateErrorCode =
  | "Unauthorized"
  | "Paused"
  | "CreatorNotFound"
  | "CreatorInactive"
  | "InvalidAmount"
  | "TokenNotAllowed"
  | "FeeCapExceeded"
  // Pipeline-level codes (not from the contract enum):
  | "signer_mismatch"
  | "send_failed"
  | "simulate_failed"
  | "trustline_failed"
  | "unknown";

/** UI-facing message keys for each DonateErrorCode. */
export const DONATE_ERROR_MESSAGES: Record<DonateErrorCode, string> = {
  Unauthorized: "You are not authorized to perform this action.",
  Paused: "This creator is currently paused and cannot receive donations.",
  CreatorNotFound: "This creator is not registered on-chain.",
  CreatorInactive: "This creator is inactive and cannot receive donations.",
  InvalidAmount: "The donation amount must be greater than zero.",
  TokenNotAllowed: "This token is not in the allowed list.",
  FeeCapExceeded: "The platform fee exceeds the configured cap.",
  signer_mismatch: "The signing wallet does not match the donor address.",
  send_failed: "The transaction was rejected by the network.",
  simulate_failed: "The transaction simulation failed.",
  trustline_failed:
    "Could not establish a trustline to this token. Please try again or pick another token.",
  unknown: "An unexpected error occurred.",
};

/** Error thrown by `donateOnChain` carrying a typed `DonateErrorCode`. */
export class DonateError extends Error {
  readonly code: DonateErrorCode;
  constructor(code: DonateErrorCode, message?: string) {
    super(message ?? DONATE_ERROR_MESSAGES[code]);
    this.name = "DonateError";
    this.code = code;
  }
}

/**
 * Test seam for the Playwright E2E harness. `donateOnChain` delegates to the
 * stub when `window.__STARTIP_DONATE_STUB__` is present. The optional
 * `checkTrustline` lets the E2E harness override the donor trustline lookup (see
 * `lib/donations/trustline-check.ts`) so the two-op `change_trust` + `donate()`
 * path can be exercised without a real Soroban RPC account.
 */
export interface DonateStub {
  donateOnChain(args: DonateArgs): Promise<DonateResult>;
  checkTrustline?(args: {
    donorAddress: string;
    token: TrustlineToken;
  }): Promise<boolean>;
}

declare global {
  interface Window {
    __STARTIP_DONATE_STUB__?: DonateStub;
  }
}

/** Inputs to `donateOnChain`. Hashes are 32-byte Buffers. */
export interface DonateArgs {
  donorAddress: string;
  handleHash: Buffer;
  token: string;
  amount: bigint;
  /**
   * When `true`, the pipeline prepends a `change_trust` op (built from
   * `trustlineToken`) ahead of `donate()` so the Donor establishes the
   * trustline and donates in a single signed transaction. Defaults to `false`
   * (donate-only), which is the native-XLM / existing-trustline path.
   */
  needsTrustline?: boolean;
  /**
   * The selected token's metadata, used to build the `change_trust` op.
   * Required when `needsTrustline` is `true`; ignored otherwise.
   */
  trustlineToken?: TrustlineToken;
}

/** Result of a successful `donate` submission. */
export interface DonateResult {
  status: string;
  hash: string;
}

/** Dependencies so the pipeline can be unit-tested without window globals. */
export interface DonateDeps {
  rpc: StellarSdk.rpc.Server;
  signWalletTransaction: (txXdr: string) => Promise<{
    signedTxXdr: string;
    signerAddress?: string;
  }>;
  networkPassphrase: string;
  contractId: string;
}

/**
 * Build, sign, and submit `donate(donor, creator_id_hash, token, amount)`.
 *
 * 1. Delegate to `window.__STARTIP_DONATE_STUB__` if present (E2E seam).
 * 2. Build the optional `change_trust` pre-operation and the `donate` args.
 * 3. Invoke the shared `donation-router-invocation` pipeline.
 * 4. Map any `InvocationError` to a domain-specific `DonateError`.
 *
 * Throws `DonateError` on any step failure, carrying a typed code the UI can
 * map to a user-facing message.
 */
export async function donateOnChain(
  args: DonateArgs,
  deps: DonateDeps,
): Promise<DonateResult> {
  const stub =
    typeof window !== "undefined" ? window.__STARTIP_DONATE_STUB__ : undefined;
  if (stub) return stub.donateOnChain(args);

  const { donorAddress, handleHash, token, amount } = args;
  const { rpc, signWalletTransaction, networkPassphrase, contractId } = deps;

  // When the Donor lacks a trustline to a non-native token, prepend a
  // change_trust op so the Donor establishes the trustline and donates in a
  // single signed transaction. Skipped for native XLM and existing trustlines
  // (the donate form gates this on `needsTrustline`).
  const preOperations: StellarSdk.xdr.Operation[] = [];
  if (args.needsTrustline && args.trustlineToken) {
    preOperations.push(buildChangeTrustOp(args.trustlineToken, donorAddress));
  }

  try {
    return await invokeDonationRouter({
      method: "donate",
      args: [
        StellarSdk.Address.fromString(donorAddress).toScVal(),
        StellarSdk.xdr.ScVal.scvBytes(handleHash),
        StellarSdk.Address.fromString(token).toScVal(),
        new StellarSdk.ScInt(amount).toI128(),
      ],
      preOperations,
      signer: {
        address: donorAddress,
        signTransaction: signWalletTransaction,
      },
      networkConfig: { rpc, contractId, networkPassphrase },
    });
  } catch (e) {
    if (e instanceof InvocationError) {
      if (e.code === "unknown") {
        throw new DonateError(
          args.needsTrustline ? "trustline_failed" : "simulate_failed",
          e.message,
        );
      }
      const candidate = e.code as string;
      const donorCode = (candidate in DONATE_ERROR_MESSAGES
        ? candidate
        : "unknown") as DonateErrorCode;
      throw new DonateError(donorCode, e.message);
    }
    throw e;
  }
}
