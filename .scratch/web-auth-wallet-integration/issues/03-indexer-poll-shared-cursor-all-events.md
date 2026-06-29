Status: ready-for-agent

## Parent

`.scratch/web-auth-wallet-integration/PRD.md`

## What to build

The indexer reconcile engine: a single poll job that scans every
DonationRouter event from one shared cursor and mirrors all event types into
Supabase. This is the foundation that the Creator onboarding slice (flipping
`onchain_registered`) and the donate slice (mirroring donations + token
metadata) depend on. ADR-0003 fixes the two-path contract (confirm + indexer)
and the shared-cursor, dispatch-by-topic design.

Write the `donations`, `tokens`, and `indexer_state` migrations under
`web/supabase/migrations/`.

`donations` (PRD §Supabase schema):

```
id                  uuid PK, default gen_random_uuid()
donation_id_hash    bytea, NOT NULL   -- sha256(id::text)
tx_hash             text, UNIQUE, nullable
creator_profile_id  uuid, FK profiles(id), NOT NULL
handle_hash         bytea, NOT NULL   -- denormalized for indexer match
token               text, NOT NULL    -- SAC contract address
amount              numeric, NOT NULL -- raw i128 as numeric
message             text, nullable
donor_name          text, NOT NULL, default 'Anonymous'
donor_address       text, nullable    -- extracted from tx source at confirm
user_id             uuid, FK auth.users(id), nullable
status              text, NOT NULL, default 'pending'  -- pending|confirmed|indexed
moderation_status   text, NOT NULL, default 'visible'  -- visible|hidden
created_at          timestamptz, NOT NULL, default now()
confirmed_at        timestamptz, nullable
indexed_at          timestamptz, nullable
```

`donation_id = id` (one column, no separate `donation_id`). `handle_hash` is
denormalized so the indexer can match events without a join. `amount` is
`numeric` (not `bigint`) to hold arbitrary-precision `i128`. RLS: public can
SELECT `donor_name`, `amount`, `token`, `message`, `created_at`,
`creator_profile_id` for rows where `status IN ('confirmed','indexed') AND
moderation_status = 'visible'`. Creator (`auth.uid() = profiles.user_id` via
join on `creator_profile_id`) can SELECT all columns of their received
donations including hidden. Donor (`auth.uid() = donations.user_id`) can SELECT
all columns of their own donations. INSERT/UPDATE/DELETE denied to clients
(service role only), except Creator can UPDATE `moderation_status` on donations
where they are the creator (the moderation slice wires the UI; the policy lands
here).

`tokens`:

```
contract_address    text PK
symbol              text, NOT NULL
name                text, nullable
issuer              text, nullable
decimals            int, NOT NULL
icon_url            text, nullable
created_at          timestamptz, NOT NULL, default now()
```

RLS: public SELECT (donor needs the token picker). INSERT/UPDATE/DELETE service
role only.

`indexer_state`:

```
id              int PK, default 1  -- single row
last_ledger     int, NOT NULL
last_cursor     text, nullable
updated_at      timestamptz, NOT NULL, default now()
```

RLS: no client access (service role only).

Implement `POST /api/indexer/poll` (called by Vercel Cron or an external
scheduler at ~5-10s interval). Load `indexer_state` (single row). Call
`rpc.getEvents({ contractId, startLedger: last_ledger, cursor: last_cursor })`.
For each event, dispatch by topic name:

- `DonationReceived`: upsert `donations` by `tx_hash` (matching on
  `donation_id_hash` to find the pending row, or insert if not found). Set
  `status = 'indexed'`, `indexed_at = now()`.
- `CreatorRegistered`: find Profile by `handle_hash = event.creator_id_hash`.
  If found and `event.owner == owner_address`, set `onchain_registered = true`,
  `onchain_registered_at = now()`, `payout_address = event.payout_address`. If
  no matching Profile, log and skip (orphan).
- `CreatorPayoutUpdated`: find Profile by `handle_hash`. Set
  `payout_address = event.new_payout_address`.
- `CreatorActiveChanged`: find Profile by `handle_hash`. Set
  `paused = NOT event.active`.
- `TokenAllowlistUpdated`: if `added = true`, query the SAC contract once for
  `symbol()`, `name()`, `decimals()` (and `issuer` if available), upsert
  `tokens` row by `contract_address`. If `added = false`, delete the `tokens`
  row.

Update `indexer_state`: `last_ledger` + `last_cursor` from the last processed
event. Persist atomically. Idempotency: all operations are upserts or
same-value updates; re-processing the same event converges to the same state.
Handle overlapping ledger ranges safely via idempotency.

The indexer is demoable without the onboarding or donate UI: seed events on-chain
via the `stellar` CLI (Admin registers a test Creator, adds tokens to the
allowlist, sends a donation), run the poll endpoint, and assert Supabase state
mirrors the events.

Tests: Vitest for the poll handler with mocked `rpc.getEvents` returning each
event type (asserts correct Supabase upsert/update calls, cursor advance, and
idempotency on re-processing). Supabase RLS tests for `donations`, `tokens`,
`indexer_state` (public, creator-via-join, donor, service-role-only paths).

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [ ] `donations` migration exists with the schema above; `donation_id = id`,
      `handle_hash` denormalized, `amount` numeric, `tx_hash` unique.
- [ ] `donations` RLS enforces public (visible confirmed/indexed only), creator
      (all own received via join), donor (own by `user_id`), service-only
      INSERT/UPDATE/DELETE, and creator `moderation_status` UPDATE.
- [ ] `tokens` migration exists; public SELECT, service-only writes.
- [ ] `indexer_state` migration exists; no client access.
- [ ] `POST /api/indexer/poll` issues one `getEvents` call filtered by contract
      ID and dispatches by topic name.
- [ ] `DonationReceived` upserts by `tx_hash` and sets `indexed`.
- [ ] `CreatorRegistered` flips `onchain_registered`, sets
      `onchain_registered_at` and `payout_address`; orphans are skipped.
- [ ] `CreatorPayoutUpdated` mirrors `payout_address`.
- [ ] `CreatorActiveChanged` mirrors `paused = NOT active`.
- [ ] `TokenAllowlistUpdated` inserts (with one SAC contract read) or deletes
      `tokens` rows.
- [ ] `indexer_state` cursor advances atomically; re-processing the same event
      is idempotent.
- [ ] Vitest covers each event dispatch, cursor advance, and idempotency.
- [ ] Supabase RLS tests pass for `donations`, `tokens`, `indexer_state`.
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.

## Blocked by

- `.scratch/web-auth-wallet-integration/issues/02-magic-link-login-profile-autocreation.md`
