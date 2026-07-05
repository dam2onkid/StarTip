# Turborepo monorepo + tách verify/indexer worker (Hono on Node)

## Context

ADR-0005 moves the verify path to a sync server-side poll of
`getTransaction`, which can take several seconds past the Vercel free-tier
10s function timeout. The indexer needs a ~10s poll loop that Vercel Cron
free cannot provide (minimum 1/day on free). Both constraints push the
on-chain-touching backend out of Next.js serverless.

The codebase is currently a single `web/` Next.js app with no monorepo
tooling. The verify and indexer logic (`lib/donations/confirm.ts`,
`lib/indexer/dispatch.ts`) is server-only TypeScript that both the Next.js
app and a future worker would need, so a shared package is required to avoid
duplication.

## Decision

**Adopt Turborepo with the `apps/` + `packages/` convention.** Move `web/`
to `apps/web/`, add `apps/worker/` for the verify + indexer process, and
extract server-shared library code into `packages/shared/` as
`@startip/shared`. `contracts/` gains a `package.json` shim so `turbo run
build` / `turbo run test` includes the Rust contract via `make`, without
`contracts/` becoming a real JS package.

**The worker is a single Node process running Hono on `@hono/node-server`.**
It serves two roles in one process: a `POST /verify` HTTP endpoint (called by
the Next.js proxy route) and an indexer loop (`setInterval` calling
`processPoll`). Hono is chosen for its lightweight routing and middleware
surface; Node (not Bun) is chosen to keep runtime parity with the existing
pnpm monorepo and `@stellar/stellar-sdk`'s Node-tested surface.

**The Next.js app proxies verify to the worker.** `apps/web/src/app/api/
donations/verify/route.ts` is a thin proxy: it forwards the request body to
`WORKER_URL` with an `Authorization: Bearer WORKER_SECRET` header and
returns the worker's response. The worker is not publicly reachable; only
the Next.js server calls it. This keeps the client's endpoint posture
unchanged (one URL, no CORS, no worker URL exposure) and gives the worker
freedom from Vercel function timeouts.

**`packages/shared/` holds server-only library code.** Moved from
`apps/web/src/lib/`:
- `donations/confirm.ts` (renamed conceptually to verify, but the function
  signature changes per ADR-0005)
- `donations/moderation.ts`
- `donations/validation.ts`
- `indexer/dispatch.ts`
- `stellar/server.ts` (drop the `import "server-only"` guard, meaningless
  outside Next.js)
- `stellar/token.ts`
- `supabase/service.ts`

Browser-only code (`donate.ts`, `stellar/client.ts`, `supabase/client.ts`,
`supabase/middleware.ts`, `supabase/server.ts`, wallet/onboarding/nav libs,
`env.ts`) stays in `apps/web/` because it depends on Next.js client/SSR
context.

**Root `package.json` orchestrates via Turbo.** `turbo run build/test/
typecheck/lint/dev` covers all JS/TS packages. `contracts:build`,
`contracts:test`, `contracts:integration` are root convenience scripts that
shell out to `make`; they are not in the Turbo pipeline (Rust build cache is
separate from pnpm cache, and `contracts/` has no JS deps).

## Considered Options

- **Keep everything in Next.js, upgrade to Vercel Pro.** Rejected. Vercel Pro
  ($20/mo) lifts the function timeout to 60s but does not fix the indexer:
  Vercel Cron Pro still cannot run a 10s poll economically, and the local
  `indexer-cron.mjs` workaround does not scale to prod. A 24/7 worker
  process solves both with one change.
- **Worker on Bun.** Rejected for MVP. Bun's production maturity is still
  debated, `@stellar/stellar-sdk` is tested on Node, and the worker's
  bottleneck is RPC network latency, not runtime throughput. Bun can be
  revisited if throughput demands it.
- **Worker on Cloudflare Workers + Durable Objects.** Rejected.
  `@stellar/stellar-sdk` uses Node builtins (`Buffer`, `crypto`) that do not
  run on the Workers runtime. Porting to raw RPC is a large risk for no
  MVP benefit.
- **Worker on Supabase Edge Functions (Deno).** Rejected. CPU limit (150ms)
  is too tight for a multi-second `getTransaction` poll.
- **Expose the worker publicly (client calls worker directly).** Rejected.
  Adds CORS, auth, rate-limit, and DDoS surface. The Next.js proxy keeps the
  worker internal and the client posture unchanged.
- **Queue-based async verify (Supabase Queues + pg_cron).** Rejected for MVP.
  Adds a queue layer with retry semantics that the indexer already provides.
  Verify is a sync request-response flow; a queue does not improve it.
- **Flat layout (keep `web/` at root, add `worker/` + `packages/shared/`
  alongside).** Rejected. The `apps/` + `packages/` convention is the
  Turborepo default and makes the structure self-documenting. Moving `web/`
  is a one-time cost; staying flat creates an inconsistent convention that
  is harder to reason about later.
- **Contracts outside Turbo.** Rejected. Including `contracts/` via a
  `package.json` shim lets `turbo run build` produce the WASM in one command,
  which is valuable for deploy pipelines. The shim has no JS deps so pnpm
  creates an empty `contracts/node_modules/` (gitignored).

## Consequences

- **`web/` moves to `apps/web/`.** All path references in `.gitignore`,
  scripts, and docs must update from `web/...` to `apps/web/...`. Playwright
  config uses relative paths and is portable. No hardcoded `web/` path was
  found outside `.gitignore` and `.scratch/` (historical).
- **Shared code lives in `packages/shared/` and is imported as
  `@startip/shared/donations/confirm` etc.** Both `apps/web/` and
  `apps/worker/` depend on `@startip/shared` via pnpm workspace links. The
  shared package has no `next` dependency; the `server-only` guard is removed
  from moved files.
- **Two deploy targets.** `apps/web/` deploys to Vercel (UI, auth, public RLS
  reads, verify proxy). `apps/worker/` deploys to a long-lived Node host
  (Railway / Fly / Render, ~$5-10/mo). The worker is a SPOF for the donate
  flow, but the indexer is self-healing and the client can fall back to
  Supabase Realtime if verify times out.
- **Worker env.** `WORKER_PORT`, `WORKER_SECRET`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `STELLAR_RPC_URL`,
  `STELLAR_NETWORK_PASSPHRASE`, `DONATION_ROUTER_CONTRACT_ID`,
  `INDEXER_POLL_MS`, `INDEXER_START_LEDGER`, `VERIFY_POLL_MAX_MS`. The
  Next.js proxy needs `WORKER_URL` and `WORKER_SECRET` (server-side env, not
  `NEXT_PUBLIC_`).
- **`pnpm-workspace.yaml` expands to `[apps/*, packages/*]`.** The root
  `package.json` adds `turbo` as a devDependency and Turbo task scripts.
  `contracts/package.json` is a shim with `build`/`test`/`integration-test`
  scripts calling `make`.
- **Cold start is not a concern for the worker** because it is a long-lived
  process, unlike Vercel functions. The indexer `setInterval` and the Hono
  server share the same `@stellar/stellar-sdk` and `@supabase/supabase-js`
  instances, keeping memory steady.
