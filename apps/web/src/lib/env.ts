import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    /**
     * Optional starting ledger for the indexer's first poll. When unset (or 0),
     * the indexer bootstraps from `getLatestLedger()`. Set this to the
     * DonationRouter deploy ledger (or earlier) so a fresh indexer scans
     * history instead of skipping every event emitted before its first poll.
     */
    INDEXER_START_LEDGER: z.coerce.number().int().min(0).default(0),
    /**
     * Base URL of the verify/indexer worker (ADR-0006). The Next.js
     * `/api/donations/verify` route proxies here. Set in the deployment env.
     */
    WORKER_URL: z.string().url(),
    /**
     * Shared secret for the worker's `Bearer` auth. Must match the worker's
     * `WORKER_SECRET`.
     */
    WORKER_SECRET: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_STELLAR_NETWORK: z
      .enum(["testnet", "pubnet"])
      .default("testnet"),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID: z.string().min(1),
    NEXT_PUBLIC_LENIS_DISABLED: z.string().default("false"),
  },
  runtimeEnv: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    INDEXER_START_LEDGER: process.env.INDEXER_START_LEDGER,
    WORKER_URL: process.env.WORKER_URL,
    WORKER_SECRET: process.env.WORKER_SECRET,
    NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID:
      process.env.NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID,
    NEXT_PUBLIC_LENIS_DISABLED: process.env.NEXT_PUBLIC_LENIS_DISABLED,
  },
});
