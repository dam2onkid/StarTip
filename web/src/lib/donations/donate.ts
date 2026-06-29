import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * Client-side donate transaction pipeline. The Donor builds, signs, and
 * submits `donate(donor, creator_id_hash, token, amount, donation_id_hash)`
 * directly to Soroban RPC from `/creator/[handle]/donate` (ADR-0002: the
 * wallet owns the on-chain signature; the server never sees the secret key).
 * The server only mirrors the resulting `DonationReceived` event via the
 * indexer and the confirm fast path.
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

/** Test seam for the Playwright E2E harness. */
export interface DonateStub {
  donateOnChain(args: DonateArgs): Promise<DonateResult>;
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
  donationIdHash: Buffer;
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
 * Decode a Soroban simulate error string into a typed `DonateErrorCode`.
 * Soroban contract errors arrive as `"Error(<VariantName>)"`; we extract the
 * variant name and map it to the typed enum. Unrecognized strings return
 * `"unknown"`.
 */
export function decodeDonateError(error: string): DonateErrorCode {
  const m = /Error\((\w+)\)/.exec(error);
  if (!m) return "unknown";
  const name = m[1] as DonateErrorCode;
  if (name in DONATE_ERROR_MESSAGES) return name;
  return "unknown";
}

/**
 * Build, sign, and submit `donate(donor, creator_id_hash, token, amount,
 * donation_id_hash)`.
 *
 * 1. Delegate to `window.__STARTIP_DONATE_STUB__` if present (E2E seam).
 * 2. Load the wallet account from RPC (the source must exist and be funded).
 * 3. Build the transaction with one `donate` invocation, invoking the wallet
 *    as the `donor` (require_auth target).
 * 4. Simulate to attach the Soroban auth + resource footprint.
 * 5. Sign with the wallet via the kit and submit.
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

  const { donorAddress, handleHash, token, amount, donationIdHash } = args;
  const { rpc, signWalletTransaction, networkPassphrase, contractId } = deps;

  const account = await rpc.getAccount(donorAddress);
  const contract = new StellarSdk.Contract(contractId);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        "donate",
        StellarSdk.Address.fromString(donorAddress).toScVal(),
        StellarSdk.xdr.ScVal.scvBytes(handleHash),
        StellarSdk.Address.fromString(token).toScVal(),
        new StellarSdk.ScInt(amount).toI128(),
        StellarSdk.xdr.ScVal.scvBytes(donationIdHash),
      ),
    )
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new DonateError(
      decodeDonateError(sim.error ?? "") === "unknown"
        ? "simulate_failed"
        : decodeDonateError(sim.error ?? ""),
      sim.error,
    );
  }

  const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build();
  const { signedTxXdr, signerAddress } = await signWalletTransaction(
    prepared.toXDR(),
  );
  if (signerAddress && signerAddress !== donorAddress) {
    throw new DonateError("signer_mismatch");
  }

  const signed = StellarSdk.TransactionBuilder.fromXDR(
    signedTxXdr,
    networkPassphrase,
  );
  const sent = await rpc.sendTransaction(signed);
  if (sent.status === "ERROR") {
    throw new DonateError("send_failed");
  }
  return { status: sent.status, hash: sent.hash };
}
