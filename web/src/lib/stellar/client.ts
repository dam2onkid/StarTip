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
