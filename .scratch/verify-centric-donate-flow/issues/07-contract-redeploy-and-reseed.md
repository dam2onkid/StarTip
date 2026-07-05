# 07 - Contract redeploy and re-seed

Status: ready-for-human
Role: backend

## Task

After issue 01 drops `donation_id_hash` from the contract, build the new
WASM, deploy to testnet, update env, and re-seed the contract state (config,
token allowlist, test creators).

## Steps

### 1. Build the new WASM

```bash
cd contracts && make build
```

Output: `contracts/donation-router/target/wasm32-unknown-unknown/release/
donationRouter.wasm` (or similar).

### 2. Deploy to testnet

```bash
stellar contract deploy \
  --wasm contracts/donation-router/target/wasm32-unknown-unknown/release/donationRouter.wasm \
  --network testnet \
  --source <admin-identity>
```

Capture the new contract ID.

### 3. Update `apps/web/.env`

```
NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID=<new-contract-id>
```

Also update `apps/worker/.env` (or `.env.local`):

```
DONATION_ROUTER_CONTRACT_ID=<new-contract-id>
```

### 4. Initialize config via `__constructor`

```bash
stellar contract invoke \
  --id <new-contract-id> \
  --network testnet \
  --source <admin-identity> \
  -- \
  __constructor \
  --admin <admin-address> \
  --treasury <treasury-address> \
  --max_fee_bps <cap> \
  --platform_fee_bps <initial-fee> \
  --paused false
```

### 5. Re-seed token allowlist

For each SAC token (USDC testnet, etc.):

```bash
stellar contract invoke \
  --id <new-contract-id> \
  --network testnet \
  --source <admin-identity> \
  -- \
  add_token \
  --token <token-contract-address>
```

The indexer will mirror `TokenAllowlistUpdated` events into the `tokens`
table, OR re-seed the `tokens` table directly via SQL if the indexer is not
running yet.

### 6. Re-register test creators

Either via the onboarding flow (web UI) or via CLI:

```bash
stellar contract invoke \
  --id <new-contract-id> \
  --network testnet \
  --source <creator-owner-identity> \
  -- \
  register_creator \
  --creator_id_hash <sha256(handle)> \
  --payout_address <payout-address>
```

Update the corresponding `profiles` rows: set `onchain_registered = true`,
`owner_address`, `payout_address`, `handle_hash`.

### 7. Verify with integration.sh

```bash
cd contracts && make integration-test
```

This deploys its own contract instance for testing (line 157 of
`integration.sh`), so it does not use the testnet contract ID. It verifies
the new `donate()` signature (4 args) and 7-field event shape.

### 8. Smoke test the full flow

1. Boot worker: `cd apps/worker && pnpm dev`
2. Boot web: `cd apps/web && pnpm dev`
3. Open `/creator/<handle>/donate` in browser
4. Connect wallet, fill form, submit
5. Verify: worker logs `POST /verify 200`, Supabase `donations` row
   inserted as `confirmed`
6. Open `/overlay/<handle>`, confirm donation appears

## Cleanup

- The old contract (`CBMAACZ23PQPSV3XM6K22W7KP3T4IE7X7SLRVO44EKACP64N36GY7IYK`)
  stays on testnet as an orphan. No cleanup needed (testnet).
- Old `donations` rows referencing the old contract are test data; the
  migration in issue 02 deletes `pending` rows. `confirmed`/`indexed` rows
  from the old contract can be left or wiped via `truncate donations`.

## Dependencies

- Issue 01 (contract code change) must land first.
- Issue 02 (DB migration) should land before or alongside, so the DB
  schema matches the new contract.
- Issue 05 + 06 (worker + web) should be ready for the smoke test.

## Comments

- Review (2026-07-05): unlike issues 01-06 and 08, this issue is mostly a
  sequence of side-effecting, credential-bearing CLI operations against
  testnet (deploy with an admin identity, invoke `__constructor` /
  `add_token` / `register_creator`, capture and hand-propagate a new
  contract ID into two `.env` files) rather than a code diff with a
  deterministic verification step. Triaged `ready-for-human`: a human
  should drive or closely review this one rather than an unattended agent.
