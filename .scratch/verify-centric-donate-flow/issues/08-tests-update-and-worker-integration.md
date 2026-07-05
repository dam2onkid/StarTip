# 08 - Tests: update unit, E2E, add worker integration script

Status: ready-for-agent
Role: fullstack

## Task

Update all test layers for the verify-centric flow and add the worker
integration test script per ADR-0005 + ADR-0006.

## Changes

### Unit tests (Vitest)

#### `packages/shared/src/donations/confirm.test.ts` (renamed to `verify.test.ts`)

Update all test cases for the new `VerifyInput` signature (`tx_hash`,
`message`, `donor_name` - no `donation_id`):

- Happy path: mock `getTransaction` returns SUCCESS with
  `DonationReceived` event, verify returns 200, row upserted as
  `confirmed` with `message`/`donor_name` from input.
- Existing `indexed` row: verify promotes to `confirmed`, fills
  `message`/`donor_name`.
- Existing `confirmed` row: idempotent, returns 200, no duplicate.
- `tx_not_found`: mock returns NOT_FOUND, verify returns 404.
- `tx_failed`: mock returns FAILED, verify returns 409.
- `donation_event_not_found`: SUCCESS tx but no `DonationReceived` event,
  verify returns 409.
- `creator_not_found`: event has `handle_hash` with no matching profile,
  verify returns 409.
- Remove all `donation_id_hash` match test cases.
- Remove `donation_id` from mock inputs.

#### `packages/shared/src/indexer/dispatch.test.ts`

- Remove `donation_id_hash` from mock event values.
- Remove the match-by-`donation_id_hash` test cases.
- Match-by-`tx_hash` is now the only path; verify insert + update cases.
- Event shape: 7 fields (no `donation_id_hash`).

#### `apps/web/src/lib/donations/donate.test.ts`

- Remove `donationIdHash` from `DonateArgs` mocks.
- `contract.call("donate", ...)` expects 4 args, not 5.
- Update the simulate/build/sign/submit assertions.

#### Delete `apps/web/src/lib/donations/prepare.test.ts`

Prepare is gone; its tests are gone.

#### `apps/worker/src/server.test.ts` (new)

Hono app unit tests with mock RPC + mock Supabase:

- `POST /verify` happy path: valid secret, mock tx SUCCESS, returns 200
  `{status: "confirmed"}`.
- `POST /verify` unauthorized: missing/bad `Authorization` header, returns
  401.
- `POST /verify` invalid body: missing `tx_hash`, returns 400.
- `POST /verify` tx not found: mock returns NOT_FOUND within poll window,
  returns 404.
- `POST /verify` tx not visible: mock returns NOT_FOUND past
  `VERIFY_POLL_MAX_MS`, returns 202.
- `POST /verify` tx failed: mock returns FAILED, returns 409.
- `POST /verify` event not found: SUCCESS but no `DonationReceived`,
  returns 409.

#### `apps/worker/src/indexer.test.ts` (new)

- Indexer loop starts, calls `processPoll` at interval.
- Loop stops on SIGTERM/SIGINT.
- Loop logs errors but continues.

### E2E tests (Playwright)

#### `apps/web/tests/donate.spec.ts`

Update mocks:

- Remove `PREPARE_RESPONSE` mock and the `page.route("**/api/donations/
  prepare", ...)` handler.
- Remove `page.route("**/api/donations/confirm", ...)`.
- Add `page.route("**/api/donations/verify", ...)` returning
  `{status: "confirmed"}` with status 200.
- Update `installSeams`: the `__STARTIP_DONATE_STUB__` stays (client still
  builds + signs + submits `donate()`), but the stub's `donateOnChain`
  no longer receives `donationIdHash` in args.
- Update test descriptions: "prepare -> donate -> confirm -> success"
  becomes "donate -> verify -> success".
- Error path (`paused`): stub throws `Paused`, UI surfaces message.
  Verify route is never reached (donate throws before verify).

#### Update `apps/web/tests/fixtures/mock-supabase.mjs`

If the mock Supabase server returns `donation_id_hash` in any fixture
responses, remove it. The `tokens` endpoint response stays the same.

### Worker integration test (new)

#### `apps/worker/tests/integration.sh`

Bash script, pattern follows `contracts/.../integration.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Deploy a fresh contract instance on testnet (or reuse integration.sh's).
# 2. Configure: __constructor, add_token.
# 3. Register a test creator.
# 4. Submit a real donate() tx via stellar CLI.
# 5. Capture the tx hash.
# 6. Start the worker (if not running).
# 7. POST /verify with the tx hash.
# 8. Assert response is 200 { status: "confirmed" }.
# 9. Query Supabase: assert donations row exists with tx_hash, status =
#    confirmed, message/donor_name match.
# 10. Stop worker (if started by this script).
```

Environment:
- `STELLAR_NETWORK=testnet`
- `WORKER_URL=http://localhost:3101`
- `WORKER_SECRET=<test-secret>`
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for assertion queries.

Skip if `SKIP_INTEGRATION=1` (for CI that cannot reach testnet).

## Verification

- `turbo run test` passes (all unit tests).
- `cd apps/web && pnpm test:e2e` passes (Playwright).
- `cd contracts && make integration-test` passes (contract integration).
- `bash apps/worker/tests/integration.sh` passes (worker integration, when
  testnet + Supabase are reachable).
- Manual smoke test per issue 07 step 8.

## Dependencies

- Issues 01-07 must land first. This issue is the verification gate.

## Comments

- Review (2026-07-05): well-scoped as the final gate. Triaged
  `ready-for-agent`, but it is blocked until 01-07 land — do not dispatch
  before then.
