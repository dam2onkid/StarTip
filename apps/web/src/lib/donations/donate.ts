import * as StellarSdk from "@stellar/stellar-sdk";
import { buildChangeTrustOp, type TrustlineToken } from "@/lib/donations/trustline";

/**
 * Client-side donate transaction pipeline. The Donor builds, signs, and
 * submits `donate(donor, creator_id_hash, token, amount)` directly to Soroban
 * RPC from `/creator/[handle]/donate` (ADR-0002: the wallet owns the on-chain
 * signature; the server never sees the secret key). The server only mirrors
 * the resulting `DonationReceived` event via the indexer and the verify fast
 * path.
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
 * Test seam for the Playwright E2E harness. `donateOnChain` delegates to
 * `donateOnChain` when the stub is present. The optional `checkTrustline` lets
 * the E2E harness override the donor trustline lookup (see
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
 * Assemble a two-op `change_trust` + `donate()` transaction from a successful
 * simulation. `StellarSdk.rpc.assembleTransaction` only supports single-op
 * Soroban transactions, so for the trustline path we clone the simulated
 * transaction with its Soroban data, clear the operations, re-add the
 * `change_trust` op, and re-add the `donate` invocation with the simulation
 * auth entries attached. The fee logic mirrors `assembleTransaction`.
 */
function assembleTwoOpTransaction(
  raw: StellarSdk.Transaction,
  simulation: StellarSdk.rpc.Api.SimulateTransactionResponse,
  changeTrustOp: StellarSdk.xdr.Operation,
  donateOp: StellarSdk.xdr.Operation,
  networkPassphrase: string,
): StellarSdk.Transaction {
  const success = StellarSdk.rpc.parseRawSimulation(simulation);
  if (!StellarSdk.rpc.Api.isSimulationSuccess(success)) {
    throw new Error(`simulation incorrect: ${JSON.stringify(success)}`);
  }
  // `raw.fee` is the total classic fee (per-op fee * op count). Recover the
  // per-op fee so cloneFrom does not double it; strip any existing resource fee
  // so a re-simulation does not double-count it.
  const numOps = BigInt(raw.operations.length);
  let classicFeePerOp = numOps > BigInt(0) ? BigInt(raw.fee) / numOps : BigInt(raw.fee);
  const rawSorobanData = raw.toEnvelope().v1().tx().ext().value();
  if (rawSorobanData) {
    const rf = rawSorobanData.resourceFee().toBigInt();
    if (classicFeePerOp - rf > BigInt(0)) classicFeePerOp -= rf;
  }
  const txnBuilder = StellarSdk.TransactionBuilder.cloneFrom(raw, {
    fee: classicFeePerOp.toString(),
    sorobanData: success.transactionData.build(),
    networkPassphrase,
  });
  // Re-add every op, attaching the simulation auth to the donate
  // invokeHostFunction op (assembleTransaction cannot do this for multi-op).
  txnBuilder.clearOperations();
  txnBuilder.addOperation(changeTrustOp);
  const ihf = donateOp.body().invokeHostFunctionOp();
  const existingAuth = ihf.auth() ?? [];
  txnBuilder.addOperation(
    StellarSdk.Operation.invokeHostFunction({
      func: ihf.hostFunction(),
      auth: existingAuth.length > 0 ? existingAuth : (success.result?.auth ?? []),
    }),
  );
  return txnBuilder.build();
}

/**
 * Build, sign, and submit `donate(donor, creator_id_hash, token, amount)`.
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

  const { donorAddress, handleHash, token, amount } = args;
  const { rpc, signWalletTransaction, networkPassphrase, contractId } = deps;

  const account = await rpc.getAccount(donorAddress);
  const contract = new StellarSdk.Contract(contractId);

  const builder = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  });

  // When the Donor lacks a trustline to a non-native token, prepend a
  // change_trust op so the Donor establishes the trustline and donates in a
  // single signed transaction. Skipped for native XLM and existing trustlines
  // (the donate form gates this on `needsTrustline`).
  let changeTrustOp: StellarSdk.xdr.Operation | undefined;
  if (args.needsTrustline && args.trustlineToken) {
    changeTrustOp = buildChangeTrustOp(args.trustlineToken, donorAddress);
    builder.addOperation(changeTrustOp);
  }

  // Keep a reference to the donate invocation so the two-op assembler can
  // re-attach the simulation auth to it (assembleTransaction only supports
  // single-op Soroban transactions).
  const donateOp = contract.call(
    "donate",
    StellarSdk.Address.fromString(donorAddress).toScVal(),
    StellarSdk.xdr.ScVal.scvBytes(handleHash),
    StellarSdk.Address.fromString(token).toScVal(),
    new StellarSdk.ScInt(amount).toI128(),
  );

  const tx = builder.addOperation(donateOp).setTimeout(30).build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    const decoded = decodeDonateError(sim.error ?? "");
    if (decoded !== "unknown") {
      // A recognized contract error (Paused, TokenNotAllowed, ...): surface it
      // directly so the donor sees the specific cause even in the two-op path.
      throw new DonateError(decoded, sim.error);
    }
    // Unrecognized simulation failure. In the two-op path the change_trust op
    // is the new, gating step: treat a non-contract failure as a trustline
    // failure so the form shows `trustline_failed` and never submits donate().
    throw new DonateError(
      args.needsTrustline ? "trustline_failed" : "simulate_failed",
      sim.error,
    );
  }

  // assembleTransaction only supports single-op Soroban txs. The two-op
  // change_trust + donate() path needs a manual clone + auth re-attach.
  const prepared = changeTrustOp
    ? assembleTwoOpTransaction(tx, sim, changeTrustOp, donateOp, networkPassphrase)
    : StellarSdk.rpc.assembleTransaction(tx, sim).build();
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
