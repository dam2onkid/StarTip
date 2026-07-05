# Verify-centric donate flow

## Summary

Refactor the donate flow from prepare -> donate -> confirm (two-path, pending
row, `donation_id_hash` link) to donate -> verify (single-path, `tx_hash` as
sole key, indexer safety net). Extract verify + indexer into a Hono worker
process, adopt Turborepo, and redeploy the contract without
`donation_id_hash`.

## Motivation

The current flow (ADR-0001 + ADR-0003) is over-engineered for dev state:

- `donation_id_hash` is dead weight on-chain (contract does not track replays,
  ADR-0004) and off-chain once `tx_hash` is available.
- `prepare` exists only to mint the hash and insert a pending row, but that
  pending row is the root cause of the orphan-row complexity ADR-0003 works
  around.
- Confirm-by-hash is strictly more complex than confirm-by-tx_hash for zero
  security benefit.
- Vercel free 10s timeout cannot safely host a sync `getTransaction` poll, and
  Vercel Cron free cannot run a 10s indexer loop.

## Decisions (from grilling session)

See ADR-0005 (flow) and ADR-0006 (architecture) for the full rationale.

1. Drop `donation_id_hash` from `donate()` signature + `DonationReceived`
   event. Redeploy contract (dev state, no prod data).
2. Drop `prepare` endpoint. Client validates locally (public RLS views +
   contract revert for races).
3. Verify endpoint receives `{tx_hash, message, donor_name}`. Worker polls
   `getTransaction`, verifies, upserts by `tx_hash` as `confirmed`.
4. Indexer remains as safety net. Inserts `indexed` row by `tx_hash` with
   default content if verify never fires. Verify promotes `indexed` ->
   `confirmed` + fills content.
5. Sync verify response: 200 on success, 409 on failure, 404 on tx not found,
   202 if poll window expires (indexer catches later). Client subscribes
   Supabase Realtime for the slow path.
6. Off-chain content (message, donor_name) trusted from client. Moderation +
   rate-limit handle spam. No on-chain content hash (preserves ADR-0001
   moderation policy).
7. Tách worker Node 24/7 (Hono on `@hono/node-server`). Next.js proxies
   `/api/donations/verify` to worker. Worker not public.
8. Turborepo with `apps/` + `packages/` convention. `web/` -> `apps/web/`,
   worker -> `apps/worker/`, shared server lib -> `packages/shared/`.
9. `contracts/` in Turbo pipeline via `package.json` shim (no JS deps).
10. DB: drop `donation_id_hash` column + index, add `CHECK (status IN
    ('confirmed','indexed'))`. Keep `id` UUID as PK, `tx_hash` as unique
    natural key.
11. Worker tests: unit (Vitest with mock RPC + Supabase) + integration
    (`worker/tests/integration.sh` with real testnet contract). E2E
    Playwright mocks verify route only.

## Issues

- [01](issues/01-contract-drop-donation-id-hash.md) - Contract: drop
  `donation_id_hash` from `donate()` + event + tests + integration.sh
- [02](issues/02-db-migration-drop-donation-id-hash.md) - DB migration: drop
  column + index, add status CHECK constraint
- [03](issues/03-turborepo-setup-and-move-web.md) - Turborepo setup, move
  `web/` -> `apps/web/`, add `contracts/` shim
- [04](issues/04-shared-package-extract.md) - Extract `packages/shared/` from
  `apps/web/src/lib/`
- [05](issues/05-worker-hono-verify-and-indexer.md) - Create `apps/worker/`
  with Hono verify endpoint + indexer loop
- [06](issues/06-web-verify-proxy-and-donate-form.md) - Web: add verify proxy
  route, update donate-form, remove prepare route
- [07](issues/07-contract-redeploy-and-reseed.md) - Build, redeploy contract,
  update env, re-seed config + test creators
- [08](issues/08-tests-update-and-worker-integration.md) - Update unit tests,
  E2E, add worker integration script

## Test plan

- [ ] `cargo test` passes with updated `donate()` signature (no
  `donation_id_hash` arg)
- [ ] `contracts/.../integration.sh` passes with updated event shape (7 fields)
- [ ] `turbo run typecheck` passes across all packages
- [ ] `turbo run test` passes (Vitest unit tests updated for verify-only flow)
- [ ] `worker/tests/integration.sh` passes: deploy contract, submit donate via
  CLI, post txHash to worker, assert Supabase row
- [ ] Playwright `donate.spec.ts` passes: happy path (mock verify -> success)
  + error path (Paused error from stub)
- [ ] Manual smoke: donate on testnet with real wallet, verify worker inserts
  row, overlay shows donation within seconds
- [ ] Manual smoke: close tab before verify returns, indexer catches row
  within 10s, overlay shows donation (default content)
