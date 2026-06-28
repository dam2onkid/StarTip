import "server-only";
import * as StellarSdk from "@stellar/stellar-sdk";
import { env } from "@/lib/env";

const isPubnet = env.NEXT_PUBLIC_STELLAR_NETWORK === "pubnet";

const rpcUrl = isPubnet
  ? "https://soroban-rpc.stellar.org"
  : "https://soroban-testnet.stellar.org";

const horizonUrl = isPubnet
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";

/**
 * Soroban RPC client for server-side use (route handlers, RSC data fetching).
 * Server-only: the `server-only` import above prevents this module from being
 * bundled into a client component.
 */
export const rpc = new StellarSdk.rpc.Server(rpcUrl);

/**
 * Horizon client for server-side classic-ledger reads.
 */
export const horizon = new StellarSdk.Horizon.Server(horizonUrl);
