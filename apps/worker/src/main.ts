import { Hono } from "hono";
import { serve } from "@hono/node-server";
import * as StellarSdk from "@stellar/stellar-sdk";
import { createClient } from "@supabase/supabase-js";
import { readTokenMetadata } from "@startip/shared/stellar/token";
import { env } from "./env";
import { createVerifyApp } from "./server";
import { createTtsApp, EdgeTtsProvider } from "./tts";
import { startIndexerLoop } from "./indexer";

/**
 * Worker entry point. Boots the Hono verify server + the indexer poll loop in
 * a single Node process (ADR-0006).
 */

// Shared clients (created once, reused across requests + polls).
const rpc = new StellarSdk.rpc.Server(env.STELLAR_RPC_URL);
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Verify endpoint deps.
const verifyDeps = { service, rpc, contractId: env.DONATION_ROUTER_CONTRACT_ID };
const verifyApp = createVerifyApp(
  verifyDeps,
  { pollMaxMs: env.VERIFY_POLL_MAX_MS, pollIntervalMs: env.VERIFY_POLL_INTERVAL_MS },
  env.WORKER_SECRET,
);

// TTS endpoint deps.
const ttsApp = createTtsApp(
  { provider: new EdgeTtsProvider() },
  { synthesizeTimeoutMs: env.TTS_SYNTHESIZE_TIMEOUT_MS },
  env.WORKER_SECRET,
);

const app = new Hono();
app.route("/", verifyApp);
app.route("/", ttsApp);

// Indexer loop deps.
const stopIndexer = startIndexerLoop(
  {
    supabase: service,
    rpc,
    tokenReader: (rpcClient, contractAddress) =>
      readTokenMetadata(rpcClient, contractAddress, env.STELLAR_NETWORK_PASSPHRASE),
    contractId: env.DONATION_ROUTER_CONTRACT_ID,
    startLedger: env.INDEXER_START_LEDGER,
  },
  env.INDEXER_POLL_MS,
);

// Boot Hono server.
serve({ fetch: app.fetch, port: env.WORKER_PORT }, (info) => {
  console.log(`[worker] listening on http://localhost:${info.port}`);
});

// Graceful shutdown.
function shutdown() {
  stopIndexer();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
