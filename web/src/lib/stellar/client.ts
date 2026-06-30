import * as StellarSdk from "@stellar/stellar-sdk";
import { env } from "@/lib/env";

/**
 * Network passphrase for the configured Stellar network. Client-safe: derived
 * from `NEXT_PUBLIC_STELLAR_NETWORK` and the SDK's `Networks` table.
 */
export const networkPassphrase: string =
  env.NEXT_PUBLIC_STELLAR_NETWORK === "pubnet"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;

/**
 * `true` when the app is configured for Stellar pubnet. Derived from the same
 * source as `networkPassphrase` so the two never disagree.
 */
export const isPubnet: boolean = env.NEXT_PUBLIC_STELLAR_NETWORK === "pubnet";

/**
 * Stellar Expert account page URL for the active network. Used by the nav
 * Donate Wallet connector's "View on Stellar" menu item so a connected donor
 * can jump to the explorer for their address on the right network.
 */
export function stellarExpertAccountUrl(address: string): string {
  const network = isPubnet ? "public" : "testnet";
  return `https://stellar.expert/explorer/${network}/account/${address}`;
}

/**
 * DonationRouter contract id, exposed to the client so the donate flow can
 * build transactions without a server round-trip for contract id lookup.
 */
export const contractId: string = env.NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID;

const rpcUrl =
  env.NEXT_PUBLIC_STELLAR_NETWORK === "pubnet"
    ? "https://soroban-rpc.stellar.org"
    : "https://soroban-testnet.stellar.org";

let rpcInstance: StellarSdk.rpc.Server | null = null;

/**
 * Lazily-initialized Soroban RPC client for client-side transaction building.
 * Created on first call and cached for the lifetime of the module.
 */
export function getRpc(): StellarSdk.rpc.Server {
  if (rpcInstance === null) {
    rpcInstance = new StellarSdk.rpc.Server(rpcUrl);
  }
  return rpcInstance;
}
