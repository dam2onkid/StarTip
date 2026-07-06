import * as StellarSdk from "@stellar/stellar-sdk";
import { contractId, getRpc, networkPassphrase } from "@/lib/stellar/client";
import { signWalletTransaction } from "@/lib/wallet/kit";
import { handleHashBuffer } from "@/lib/creators/handle-shared";

/**
 * Client-side onboarding transaction helpers. The Creator builds, signs, and
 * submits `register_creator(handle_hash, payout_address)` directly to Soroban
 * RPC from the dashboard (ADR-0002: the wallet owns the on-chain signature;
 * the server never sees the secret key). The server only mirrors the resulting
 * `CreatorRegistered` event via the indexer.
 *
 * Test seam: when `window.__STARTIP_REGISTER_STUB__` is present (injected by
 * the Playwright E2E harness), `registerCreatorOnChain` delegates to it
 * instead of building and submitting a real transaction. This avoids mocking
 * the full Soroban JSON-RPC surface in E2E.
 */

const SIM_SOURCE_PUBLIC_KEY =
  "GD4SFEEGT2D4TJA22S47IMF3GH4Y3554G766B2ANNIDSFHHC2D5WBV7V";

export interface RegisterStub {
  registerCreatorOnChain(args: {
    ownerAddress: string;
    handle: string;
    payoutAddress: string;
  }): Promise<RegisterResult>;
}

declare global {
  interface Window {
    __STARTIP_REGISTER_STUB__?: RegisterStub;
    __STARTIP_TREASURY_STUB__?: () => Promise<string | null>;
  }
}

/** Result of a successful `register_creator` submission. */
export interface RegisterResult {
  status: string;
  hash: string;
}

/**
 * Build, sign, and submit `register_creator(handle_hash, payout_address)`.
 *
 * 1. Load the wallet account from RPC (the source must exist and be funded).
 * 2. Build the transaction with one `register_creator` invocation, invoking
 *    the wallet as the `owner` (require_auth target).
 * 3. Simulate to attach the Soroban auth + resource footprint.
 * 4. Sign with the wallet via the kit and submit.
 *
 * Throws on any step failure; the UI surfaces the error message.
 */
export async function registerCreatorOnChain(args: {
  ownerAddress: string;
  handle: string;
  payoutAddress: string;
}): Promise<RegisterResult> {
  const stub =
    typeof window !== "undefined" ? window.__STARTIP_REGISTER_STUB__ : undefined;
  if (stub) return stub.registerCreatorOnChain(args);

  const { ownerAddress, handle, payoutAddress } = args;
  const rpc = getRpc();

  const account = await rpc.getAccount(ownerAddress);
  const contract = new StellarSdk.Contract(contractId);
  const handleHash = handleHashBuffer(handle);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        "register_creator",
        StellarSdk.Address.fromString(ownerAddress).toScVal(),
        StellarSdk.xdr.ScVal.scvBytes(handleHash),
        StellarSdk.Address.fromString(payoutAddress).toScVal(),
      ),
    )
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`simulate register_creator failed: ${sim.error}`);
  }

  const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build();
  const { signedTxXdr, signerAddress } = await signWalletTransaction(
    prepared.toXDR(),
  );
  if (signerAddress && signerAddress !== ownerAddress) {
    throw new Error(
      `signerAddress mismatch: expected ${ownerAddress}, got ${signerAddress}`,
    );
  }

  const signed = StellarSdk.TransactionBuilder.fromXDR(
    signedTxXdr,
    networkPassphrase,
  );
  const sent = await rpc.sendTransaction(signed);
  if (sent.status === "ERROR") {
    const detail = sent.errorResult
      ? sent.errorResult.result().toString()
      : "unknown";
    throw new Error(`register_creator failed: ${sent.status} ${detail}`);
  }
  return { status: sent.status, hash: sent.hash };
}

/**
 * Read the on-chain Treasury address via a read-only `get_config()` simulation.
 * Used by the payout-address warning (ADR-0004): the contract will not reject a
 * payout equal to the Treasury, so the UI warns the Creator before submission.
 * Returns null if the config is not yet initialized or the read fails.
 */
export async function readTreasuryAddress(): Promise<string | null> {
  const treasuryStub =
    typeof window !== "undefined" ? window.__STARTIP_TREASURY_STUB__ : undefined;
  if (treasuryStub) return treasuryStub();

  const rpc = getRpc();
  const contract = new StellarSdk.Contract(contractId);
  const account = new StellarSdk.Account(SIM_SOURCE_PUBLIC_KEY, "0");
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call("get_config"))
    .setTimeout(30)
    .build();
  let sim: StellarSdk.rpc.Api.SimulateTransactionResponse;
  try {
    sim = await rpc.simulateTransaction(tx);
  } catch {
    return null;
  }
  if (StellarSdk.rpc.Api.isSimulationError(sim) || !sim.result) return null;
  const native = StellarSdk.scValToNative(sim.result.retval);
  // `Option<Config>` decodes via `scValToNative` as either an object (Some) or
  // null/empty (None). Some SDK versions wrap Some in a single-element array,
  // so both shapes are accepted.
  const config = unwrapOptionObject(native);
  if (!config) return null;
  const treasury = config.treasury_address;
  return typeof treasury === "string" ? treasury : null;
}

/**
 * Extract the inner object from an `Option<T>`-shaped native value. Returns the
 * object for both the bare-object and single-element-array shapes, or `null`
 * for None (empty array, null, undefined, non-object).
 */
function unwrapOptionObject(native: unknown): Record<string, unknown> | null {
  if (!native) return null;
  if (Array.isArray(native)) {
    if (native.length === 0) return null;
    const first = native[0];
    return isPlainObject(first) ? (first as Record<string, unknown>) : null;
  }
  return isPlainObject(native) ? (native as Record<string, unknown>) : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Classify a payout address against the two stranded-funds destinations called
 * out in ADR-0004: the contract's own address and the Treasury. The contract
 * will accept either without error, so the UI must warn before submission.
 */
export function payoutAddressWarning(
  payout: string,
  ctx: { contractId: string; treasuryAddress: string | null },
): "contract" | "treasury" | null {
  if (!payout) return null;
  if (payout === ctx.contractId) return "contract";
  if (ctx.treasuryAddress && payout === ctx.treasuryAddress) return "treasury";
  return null;
}
