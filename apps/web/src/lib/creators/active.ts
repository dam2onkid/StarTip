import * as StellarSdk from "@stellar/stellar-sdk";
import { contractId, getRpc, networkPassphrase } from "@/lib/stellar/client";
import { signWalletTransaction } from "@/lib/wallet/kit";
import { handleHashBuffer } from "@/lib/creators/handle-shared";
import { invokeDonationRouter } from "@/lib/stellar/donation-router-invocation";

/**
 * Active-Creator on-chain update helpers. Once a Creator is registered
 * (`onchain_registered = true`), the dashboard Creator tab unlocks payout
 * updates and self-pause/unpause. Both follow the same client-builds +
 * wallet-signs + submits-to-RPC pattern as `registerCreatorOnChain`
 * (ADR-0002: the wallet owns the on-chain signature; the server never sees
 * the secret key). The server only mirrors the resulting
 * `CreatorPayoutUpdated` / `CreatorActiveChanged` events via the indexer.
 *
 * Test seam: when `window.__STARTIP_CREATOR_UPDATE_STUB__` is present (injected
 * by the Playwright E2E harness), both helpers delegate to it instead of
 * building and submitting a real transaction. This avoids mocking the full
 * Soroban JSON-RPC surface in E2E.
 */

export interface CreatorUpdateStub {
  updateCreatorPayout(args: {
    ownerAddress: string;
    handle: string;
    newPayoutAddress: string;
  }): Promise<CreatorUpdateResult>;
  setCreatorActive(args: {
    ownerAddress: string;
    handle: string;
    active: boolean;
  }): Promise<CreatorUpdateResult>;
}

declare global {
  interface Window {
    __STARTIP_CREATOR_UPDATE_STUB__?: CreatorUpdateStub;
  }
}

/** Result of a successful update submission. */
export interface CreatorUpdateResult {
  status: string;
  hash: string;
}

/** Inputs to `updateCreatorPayoutOnChain`. */
export interface UpdatePayoutArgs {
  ownerAddress: string;
  handle: string;
  newPayoutAddress: string;
}

/** Inputs to `setCreatorActiveOnChain`. */
export interface SetActiveArgs {
  ownerAddress: string;
  handle: string;
  active: boolean;
}

/**
 * Build, sign, and submit `update_creator_payout(caller, creator_id_hash,
 * new_payout_address)` via `DonationRouterInvocation`. The caller is the stored
 * owner (require_auth target). Throws on any step failure; the UI surfaces the
 * error message.
 */
export async function updateCreatorPayoutOnChain(
  args: UpdatePayoutArgs,
): Promise<CreatorUpdateResult> {
  const stub =
    typeof window !== "undefined" ? window.__STARTIP_CREATOR_UPDATE_STUB__ : undefined;
  if (stub) return stub.updateCreatorPayout(args);

  const { ownerAddress, handle, newPayoutAddress } = args;
  const rpc = getRpc();

  return invokeDonationRouter({
    method: "update_creator_payout",
    args: [
      StellarSdk.Address.fromString(ownerAddress).toScVal(),
      StellarSdk.xdr.ScVal.scvBytes(handleHashBuffer(handle)),
      StellarSdk.Address.fromString(newPayoutAddress).toScVal(),
    ],
    signer: {
      address: ownerAddress,
      signTransaction: signWalletTransaction,
    },
    networkConfig: { rpc, contractId, networkPassphrase },
  });
}

/**
 * Build, sign, and submit `set_creator_active_owner(caller, creator_id_hash,
 * active)` via `DonationRouterInvocation`. The caller is the stored owner
 * (require_auth target). Pass `active = false` to self-pause, `active = true` to
 * self-unpause. Throws on any step failure; the UI surfaces the error message.
 */
export async function setCreatorActiveOnChain(
  args: SetActiveArgs,
): Promise<CreatorUpdateResult> {
  const stub =
    typeof window !== "undefined" ? window.__STARTIP_CREATOR_UPDATE_STUB__ : undefined;
  if (stub) return stub.setCreatorActive(args);

  const { ownerAddress, handle, active } = args;
  const rpc = getRpc();

  return invokeDonationRouter({
    method: "set_creator_active_owner",
    args: [
      StellarSdk.Address.fromString(ownerAddress).toScVal(),
      StellarSdk.xdr.ScVal.scvBytes(handleHashBuffer(handle)),
      StellarSdk.xdr.ScVal.scvBool(active),
    ],
    signer: {
      address: ownerAddress,
      signTransaction: signWalletTransaction,
    },
    networkConfig: { rpc, contractId, networkPassphrase },
  });
}
