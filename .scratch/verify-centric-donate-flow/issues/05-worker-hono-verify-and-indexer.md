# 05 - Create apps/worker/ with Hono verify endpoint + indexer loop

Status: ready-for-agent
Role: backend

## Task

Create the verify + indexer worker process per ADR-0006. Single Node process
running Hono on `@hono/node-server`, serving `POST /verify` and an indexer
`setInterval` loop.

## Structure

```
apps/worker/
  package.json
  tsconfig.json
  src/
    server.ts          # Hono app: POST /verify
    indexer.ts         # setInterval loop calling processPoll
    env.ts             # zod env schema (not t3-oss/env-nextjs)
    main.ts            # entry: boot Hono + start indexer loop
    server.test.ts     # unit tests for verify endpoint
    indexer.test.ts    # unit tests for indexer loop lifecycle
```

### `apps/worker/package.json`

```json
{
  "name": "@startip/worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsup src/main.ts --format esm --out-dir dist",
    "start": "node dist/main.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@startip/shared": "workspace:*",
    "@stellar/stellar-sdk": "^16.0.1",
    "@supabase/supabase-js": "^2.108.2",
    "hono": "^4.7.0",
    "@hono/node-server": "^1.14.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "tsup": "^8.5.0",
    "vitest": "^4.1.9",
    "typescript": "^5"
  }
}
```

(Pin versions published at least 7 days ago at install time.)

### `apps/worker/src/env.ts`

```ts
import { z } from "zod";

export const env = z.object({
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
}).parse(process.env);
```

### `apps/worker/src/server.ts`

Hono app with one route:

```
POST /verify
  Headers: Authorization: Bearer WORKER_SECRET
  Body: { tx_hash: string, message?: string, donor_name?: string }
  Response:
    200 { status: "confirmed" }   - tx verified, row upserted
    202 { status: "pending" }     - tx not visible within poll window
    404 { error: "tx_not_found" }
    409 { error: "tx_failed" | "donation_event_not_found" | "creator_not_found" }
    401 { error: "unauthorized" } - bad/missing WORKER_SECRET
    500 { error: "rpc_error" | "db_error" }
```

Logic (delegates to `@startip/shared/donations/confirm` after refactor per
ADR-0005, see issue 06 for the shared-side signature change):

1. Validate `Authorization: Bearer <WORKER_SECRET>`.
2. Validate body: `tx_hash` required, `message`/`donor_name` optional.
3. Poll `rpc.getTransaction(tx_hash)` every `VERIFY_POLL_INTERVAL_MS` up to
   `VERIFY_POLL_MAX_MS`:
   - If `NOT_FOUND` after window expires -> 404.
   - If `FAILED` -> 409 `tx_failed`.
   - If `SUCCESS` -> parse `DonationReceived` event, verify contract id
     matches, extract donor from tx source, upsert by `tx_hash` as
     `confirmed` with `message`/`donor_name` from body. Return 200.
   - If still `NOT_FOUND` at window expiry -> 202 (indexer will catch).
4. On event not found in a successful tx -> 409 `donation_event_not_found`.
5. On creator profile not found by `handle_hash` -> 409 `creator_not_found`.

### `apps/worker/src/indexer.ts`

```ts
import { processPoll } from "@startip/shared/indexer/dispatch";

export function startIndexerLoop(deps, pollMs) {
  let running = true;
  async function tick() {
    if (!running) return;
    try {
      await processPoll(deps, {});
    } catch (err) {
      console.error("[indexer] poll failed", err);
    }
    if (running) setTimeout(tick, pollMs);
  }
  tick();
  return () => { running = false; };
}
```

### `apps/worker/src/main.ts`

```ts
import { serve } from "@hono/node-server";
import { env } from "./env";
import { app } from "./server";
import { startIndexerLoop } from "./indexer";

// Boot indexer loop.
const stopIndexer = startIndexerLoop(/* deps */, env.INDEXER_POLL_MS);

// Boot Hono server.
serve({ fetch: app.fetch, port: env.WORKER_PORT }, (info) => {
  console.log(`[worker] listening on http://localhost:${info.port}`);
});

// Graceful shutdown.
process.on("SIGTERM", () => { stopIndexer(); process.exit(0); });
process.on("SIGINT", () => { stopIndexer(); process.exit(0); });
```

## Verification

- `turbo run typecheck` passes for worker.
- `turbo run test` passes: `server.test.ts` covers happy path (200), tx not
  found (404), tx failed (409), event not found (409), unauthorized (401),
  poll window expiry (202). Mock RPC + mock Supabase service client.
- `cd apps/worker && pnpm dev` boots, `POST /verify` with bad secret returns
  401, with valid secret + mock tx returns expected status.
- Indexer loop logs poll results at `INDEXER_POLL_MS` interval.

## Dependencies

- Issue 04 (shared package) must land first.
- Issue 06 (shared confirm refactor) changes the function signature the
  worker calls. Coordinate: the worker should call the new verify function
  signature from the start, so issue 06's shared-side refactor and issue 05
  land together or 06 first.

## Comments

- Review (2026-07-05): tightly coupled to issue 06's `confirm.ts` ->
  `verify` signature refactor as noted above — recommend running both in
  the same agent session rather than as independent parallel tasks, to
  avoid a broken intermediate state. Triaged `ready-for-agent`.
