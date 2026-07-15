import { z } from "zod";

/**
 * Worker env schema (zod, not t3-oss/env-nextjs). Validated once at boot from
 * `process.env`. The worker is a long-lived Node process (Hono on
 * @hono/node-server), so a parse failure crashes early instead of running
 * with missing config.
 */
export const env = z
  .object({
    WORKER_PORT: z.coerce.number().int().default(3101),
    WORKER_SECRET: z.string().min(1),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    STELLAR_RPC_URL: z.string().url(),
    STELLAR_NETWORK_PASSPHRASE: z.string().min(1),
    DONATION_ROUTER_CONTRACT_ID: z.string().min(1),
    INDEXER_POLL_MS: z.coerce.number().int().default(10_000),
    INDEXER_START_LEDGER: z.coerce.number().int().min(0).default(0),
    VERIFY_POLL_MAX_MS: z.coerce.number().int().default(30_000),
    VERIFY_POLL_INTERVAL_MS: z.coerce.number().int().default(1_000),
  })
  // Railway injects `PORT` at runtime and routes its edge proxy to that port;
  // it takes priority over `WORKER_PORT` (which only matters for local dev,
  // where Railway's `PORT` is absent).
  .parse({ ...process.env, WORKER_PORT: process.env.PORT ?? process.env.WORKER_PORT });

export type Env = typeof env;
