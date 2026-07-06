import "server-only";
import * as StellarSdk from "@stellar/stellar-sdk";
import { networkPassphrase } from "@/lib/stellar/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeHandle,
  handleHashBuffer,
  handleHashHex,
  type NormalizedHandle,
} from "@/lib/creators/handle-shared";

// Re-export the isomorphic helpers so existing server-side imports
// (`@/lib/creators/handle`) keep working.
export { normalizeHandle, handleHashBuffer, handleHashHex, type NormalizedHandle };

type RpcSimulate = Pick<StellarSdk.rpc.Server, "simulateTransaction">;

export interface AvailabilityResult {
  available: boolean;
  reason?: "offchain_taken" | "onchain_taken";
}

/**
 * Check Handle availability against both sources of truth: the `profiles`
 * table (off-chain reservation) and the on-chain `get_creator(sha256(handle))`
 * registry. The off-chain check runs first; if it is taken, the on-chain read
 * is skipped. Returns `available: true` only when both are free.
 */
export async function checkHandleAvailability(args: {
  supabase: SupabaseClient;
  rpc: RpcSimulate;
  contractId: string;
  handle: string;
  /** Exclude the caller's own profile so re-claiming the same handle is not a self-conflict. */
  excludeUserId?: string;
}): Promise<AvailabilityResult> {
  const { supabase, rpc, contractId, handle, excludeUserId } = args;
  const normalized = normalizeHandle(handle);
  if (!normalized.ok || !normalized.value) {
    return { available: false, reason: "offchain_taken" };
  }
  const normalizedHandle = normalized.value;

  // 1. Off-chain: any existing profile row already holding this handle.
  let query = supabase
    .from("profiles")
    .select("handle")
    .eq("handle", normalizedHandle);
  if (excludeUserId) query = query.neq("user_id", excludeUserId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (data) return { available: false, reason: "offchain_taken" };

  // 2. On-chain: simulate get_creator(sha256(handle)). `Option<Creator>`
  //    decodes via `scValToNative` as either an object (Some) or null/empty
  //    (None). Some SDK versions wrap Some in a single-element array, so both
  //    shapes are accepted.
  const hash = handleHashBuffer(normalizedHandle);
  const contract = new StellarSdk.Contract(contractId);
  const account = new StellarSdk.Account(SIM_SOURCE_PUBLIC_KEY, "0");
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call("get_creator", StellarSdk.xdr.ScVal.scvBytes(hash)))
    .setTimeout(30)
    .build();
  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`simulate get_creator failed: ${sim.error}`);
  }
  if (!sim.result) {
    throw new Error("simulate get_creator returned no result");
  }
  if (hasOnChainCreator(sim.result.retval)) {
    return { available: false, reason: "onchain_taken" };
  }
  return { available: true };
}

/** Decoded on-chain Creator entry returned by `readCreatorOnChain`. */
export interface OnChainCreator {
  owner: string;
  payout_address: string;
  active: boolean;
}

/**
 * Read `get_creator(sha256(handle))` on-chain and decode the `Option<Creator>`.
 * Returns `null` when the handle is not registered (None), or the decoded
 * Creator when it is (Some). This is the authoritative on-chain read used by
 * the reconcile path: it does not depend on the indexer mirroring the
 * `CreatorRegistered` event, so it recovers creators whose registration event
 * was missed by the indexer (e.g. emitted before the indexer's first poll).
 *
 * `Option<Creator>` decodes via `scValToNative` as either an object (Some) or
 * null/empty (None). Some SDK versions wrap Some in a single-element array, so
 * both shapes are accepted.
 */
export async function readCreatorOnChain(args: {
  rpc: RpcSimulate;
  contractId: string;
  handle: string;
}): Promise<OnChainCreator | null> {
  const { rpc, contractId, handle } = args;
  const normalized = normalizeHandle(handle);
  if (!normalized.ok || !normalized.value) return null;

  const hash = handleHashBuffer(normalized.value);
  const contract = new StellarSdk.Contract(contractId);
  const account = new StellarSdk.Account(SIM_SOURCE_PUBLIC_KEY, "0");
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call("get_creator", StellarSdk.xdr.ScVal.scvBytes(hash)))
    .setTimeout(30)
    .build();
  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`simulate get_creator failed: ${sim.error}`);
  }
  if (!sim.result) {
    throw new Error("simulate get_creator returned no result");
  }
  return decodeOnChainCreator(sim.result.retval);
}

/**
 * Decode an `Option<Creator>` ScVal into `OnChainCreator | null`. Accepts both
 * the object form (`{owner, payout_address, active}`) and the single-element
 * array form (`[{...}]`) that some SDK versions produce. Empty arrays, null,
 * and undefined map to `null` (None).
 */
function decodeOnChainCreator(retval: StellarSdk.xdr.ScVal): OnChainCreator | null {
  const native = StellarSdk.scValToNative(retval);
  const entry = unwrapOptionObject(native);
  if (!entry) return null;
  const creator = entry as Partial<OnChainCreator>;
  return {
    owner: creator.owner as string,
    payout_address: creator.payout_address as string,
    active: creator.active as boolean,
  };
}

/**
 * True when the decoded `Option<Creator>` represents Some (a registered
 * creator). Used by the availability check, which only needs the presence bit.
 */
function hasOnChainCreator(retval: StellarSdk.xdr.ScVal): boolean {
  return decodeOnChainCreator(retval) !== null;
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
 * Source account used only to build the read-only simulation envelope. It does
 * not need to exist on-chain: Soroban RPC simulates read-only calls without
 * looking up the source account's ledger entry.
 */
const SIM_SOURCE_PUBLIC_KEY =
  "GD4SFEEGT2D4TJA22S47IMF3GH4Y3554G766B2ANNIDSFHHC2D5WBV7V";
