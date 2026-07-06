# 07 - Contract redeploy and re-seed

Status: done
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

## Deployment record

Executed on testnet. The new contract replaces
`CBMAACZ23PQPSV3XM6K22W7KP3T4IE7X7SLRVO44EKACP64N36GY7IYK` (left as an
orphan per Cleanup above).

- **New contract ID**: `CCX2A6EVPHWLL4SKTS2KPUJBUHKXJVU5EZNFLZZNVJVAGNAIBHFXEH3Y`
- **WASM**: `contracts/target/wasm32v1-none/release/donation_router.wasm`
  (15372 bytes optimized, hash
  `d9fa7f8295773c1fcf65fa9b7feba6edcbb576c1e03919e822e8ded1bfec86f3`).
  Built via `stellar contract build --package donation-router`.
- **Deploy + constructor** (atomic, CAP-0058): source `continuum-deployer`,
  `--admin GDOAROA7O4BFXS3CPXUNA4NQWZJIN3YN67BEZYZMYLI4STZEFI3BODO4`,
  `--treasury_address` same as admin, `--platform_fee_bps 100`,
  `--max_fee_bps 500`. Tx
  `00857355bf8994480e62ed4a71ea0a4a19e09a7447e03261e64f1e3ff891f6b5`.
- **Token allowlist re-seeded**: `add_token` for the native XLM SAC
  (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`) and USDC
  SAC (`CA2E53VHFZ6YSWQIEIPBXJQGT6VW3VKWWZO555XKRQXYJ63GEBJJGHY7`), both
  emitting `TokenAllowlistUpdated { added: true }`. The `tokens` table
  already held these rows from the prior contract; the indexer will upsert
  the same addresses on the next `TokenAllowlistUpdated` it sees.
- **Creator re-registered**: `register_creator` for the `jadennguyen`
  handle hash (`48f8d67652c7d68e79cbbb775e7033176f355ec7989db077a870f5a5f75234e7`),
  signed by `heir1` (`GASMDBHB5FRDACGEUUZIODXR47HJYYIGKGUYRJGASLIM67JGEY7TCX3Z`)
  which is now the on-chain owner and payout address. The original owner
  key (`GADK72HP...`) was not in the local keyring, so `heir1` takes
  ownership for testnet. Tx
  `f27e9a539f131404e108aab4740985533ba439bb9f476a393cc663c817f48539`.
- **DB profile updated**: `profiles.jadennguyen` `owner_address` and
  `payout_address` set to `heir1`'s address, `onchain_registered = true`,
  `paused = false`. `indexer_state` seed row `(1, 0, null)` restored so
  the indexer bootstraps from the latest ledger on first poll.
- **Env updated**: `apps/web/.env`
  (`NEXT_PUBLIC_DONATION_ROUTER_CONTRACT_ID`) and `apps/worker/.env`
  (`DONATION_ROUTER_CONTRACT_ID`) both point at the new contract ID. Both
  files are gitignored (they hold the service role key).

### Verification

- `get_config` read: admin/treasury = `continuum-deployer`, fee 100, max
  500, paused false, allowlist = [native SAC, USDC SAC]. Matches the old
  contract exactly.
- `get_creator` read: `active = true`, owner = payout = `heir1`.
- Contract unit tests: `cargo test --package donation-router` -> 35/35
  pass.
- Monorepo typecheck: `pnpm run typecheck` -> 3/3 packages pass.
- Monorepo test suite: `pnpm run test` -> 4/4 packages pass (contracts
  35, web 364, shared, worker).
- Worker smoke test: booted `apps/worker` against the new contract ID.
  `POST /verify` returns 401 without bearer, 400 on bad body, 202
  `{ status: "pending" }` for a nonexistent tx hash after the poll
  window. Indexer loop polls the new contract ID (0 events processed,
  expected with no donations yet).

### Not done

- **Step 7 (`make integration-test`)**: skipped. The local-network
  integration test requires Docker, which is not installed in this
  environment. The contract unit tests cover the `donate()` 4-arg
  signature and 7-field event shape; the integration script remains the
  secondary seam for CLI-encoding regressions and should be run where
  Docker is available.
- **Step 8 full smoke (browser + wallet)**: the wallet-sign + Realtime
  confirm path was not exercised end-to-end (requires a human-driven
  Freighter sign). The worker verify endpoint and indexer were
  health-checked as above.
