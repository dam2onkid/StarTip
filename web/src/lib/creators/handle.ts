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

  // 2. On-chain: simulate get_creator(sha256(handle)). Option<Creator> arrives
  //    as an ScVec: empty = None (free), one element = Some (taken).
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
  const native = StellarSdk.scValToNative(sim.result.retval) as unknown[];
  if (Array.isArray(native) && native.length > 0) {
    return { available: false, reason: "onchain_taken" };
  }
  return { available: true };
}

/**
 * Source account used only to build the read-only simulation envelope. It does
 * not need to exist on-chain: Soroban RPC simulates read-only calls without
 * looking up the source account's ledger entry.
 */
const SIM_SOURCE_PUBLIC_KEY =
  "GD4SFEEGT2D4TJA22S47IMF3GH4Y3554G766B2ANNIDSFHHC2D5WBV7V";
