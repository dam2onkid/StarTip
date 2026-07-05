import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * Network selection. Read from `process.env.NEXT_PUBLIC_STELLAR_NETWORK` so the
 * Next.js app's validated env (which populates `process.env` at boot) drives
 * the choice. Defaults to `"testnet"`. The worker does not import this module;
 * it builds its own RPC client from `STELLAR_RPC_URL` (issue 05).
 */
const isPubnet = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "pubnet";

const rpcUrl = isPubnet
  ? "https://soroban-rpc.stellar.org"
  : "https://soroban-testnet.stellar.org";

const horizonUrl = isPubnet
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";

/**
 * Soroban RPC client for server-side use (route handlers, RSC data fetching).
 * The caller (Next.js route or worker) is responsible for not importing this
 * into a client bundle.
 */
export const rpc = new StellarSdk.rpc.Server(rpcUrl);

/**
 * Horizon client for server-side classic-ledger reads.
 */
export const horizon = new StellarSdk.Horizon.Server(horizonUrl);
