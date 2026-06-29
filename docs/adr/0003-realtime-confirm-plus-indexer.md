# Realtime strategy: confirm path + indexer, idempotent upsert by tx_hash

## Context

A Donation event is emitted on-chain by `DonationRouter`. The Overlay and
dashboard depend on that event landing in Supabase and triggering Realtime. We
need a strategy that is fast enough for a live demo (overlay alert within
seconds) and robust enough that a Donation is not lost if the Donor closes their
tab before confirming, or if the backend verify temporarily fails.

## Decision

**Two write paths into `donations`, both idempotent on `tx_hash`.**

1. **Confirm path (fast):** after the Donor's wallet submits `donate()`, the
   frontend posts the tx hash to `/api/donations/confirm`. The backend verifies
   the transaction and `DonationReceived` event on-chain, then upserts the
   donation row keyed by `tx_hash`. This is the primary path during normal use
   and gives sub-second-to-few-seconds overlay latency.
2. **Indexer path (reconcile):** a scheduled job (Vercel Cron hitting
   `/api/indexer/poll` at ~10s interval for MVP) scans `DonationReceived` events
   from a stored ledger cursor, upserts any donation not already present, and
   reconciles `pending` rows whose tx has since confirmed. This catches
   donations the confirm path missed (closed tab, verify failure) and is the
   foundation for a trustless indexer later.

Both paths upsert by `tx_hash` (unique constraint), so concurrent confirm +
indexer writes do not duplicate. A separate `indexer_state` table stores the
last processed ledger/cursor.

`donations.status` transitions: `pending` (prepare created the row before the
tx) → `confirmed` (confirm path verified) or `indexed` (indexer inserted first).
The confirm path promotes `indexed` → `confirmed` when it catches up. Both
states are visible to the overlay; `pending` is not.

## Considered Options

- **Confirm-only (original spec MVP):** simplest, but a Donation whose confirm
  call never fires (Donor closes tab, RPC lag) is on-chain yet absent from
  Supabase, so the overlay and dashboard miss it permanently. Acceptable for a
  controlled demo, fragile otherwise.
- **Indexer-only:** overlay latency bounded by the poll interval and the backend
  becomes the single source of truth, but a 10s poll makes live-demo alerts feel
  sluggish and adds a background job with no fast-path fallback.

## Consequences

- `donations` needs `tx_hash` unique (already in spec), plus `indexed_at` and
  `confirmed_at` timestamps to trace which path wrote first and to support
  reconciliation debugging.
- A new `indexer_state` table (single row) holds the cursor; the indexer job
  must hold it consistently (row-level lock or atomic upsert) to avoid double
  processing if cron fires twice.
- Upsert logic must be idempotent and order-independent: confirm-then-index and
  index-then-confirm must converge to the same row state.
- Vercel Cron free tier has limits on frequency and run time; ~10s is achievable
  via a self-scheduling edge function or an external scheduler if needed. The
  exact scheduling mechanism is an implementation detail, but the two-path
  contract is fixed.
- Moderation keyword filtering runs in both paths (at insert time), so a
  donation is never briefly visible then auto-hidden by a second pass.

## Extension: Creator lifecycle events (indexer-only)

`DonationRouter` emits three Creator lifecycle events, all of which use the
**indexer path only** (no confirm endpoint, no optimistic UI):

- **`CreatorRegistered`** — `register_creator(handle_hash, payout_address)`.
  Indexer verifies `event.owner == creators.owner_address` for the matching
  `handle_hash` and flips `onchain_registered = true` on the Profile.
- **`CreatorPayoutUpdated`** — `update_creator_payout(handle_hash,
  new_payout_address)`. Indexer mirrors `new_payout_address` onto the Creator
  Profile's `payout_address` column.
- **`CreatorActiveChanged`** — `set_creator_active_owner(handle_hash, active)`
  (owner self-pause/unpause) and `force_pause_creator(handle_hash, active)`
  (admin force-pause/unpause). Indexer mirrors `active` onto the Creator
  Profile's `paused` column.

All three share the same pattern as each other and with `CreatorRegistered`
as described below:

- The same poll job that scans `DonationReceived` also scans these events
  from the same RPC, in the same loop, using a **single shared cursor**: one
  `getEvents` call filtered only by contract ID, the indexer dispatches each
  event by topic name. One `indexer_state` row, one query, one cursor
  (`last_ledger` + `last_cursor`).
- The Creator's dashboard subscribes to Supabase Realtime on their own
  `profiles` row and waits for the mirrored column to flip; no manual refresh,
  no confirm endpoint, no optimistic update.
- Latency is bounded by the poll interval (5-10s for MVP), acceptable because
  none of these events have a realtime audience (no overlay) and the Creator
  is actively on the relevant dashboard page.
- Idempotency for Creator events: the indexer mirrors by
  `UPDATE profiles SET ... WHERE handle_hash = event.creator_id_hash`. A
  re-processed event updates the same value, so re-processing is naturally
  idempotent without a dedup key. (Donations remain idempotent via the
  `tx_hash` unique constraint.)

A confirm path was considered and rejected for all three: it would add
endpoints and verify logic parallel to the Donation confirm path for the sole
benefit of saving the poll interval, with no realtime audience justifying it.
The indexer already exists for Donations; adding Creator lifecycle events is
one more event type per action in the same loop. Optimistic UI was considered
and rejected for `CreatorPayoutUpdated` and `CreatorActiveChanged`: it creates
a window where the UI shows the new state but Supabase has not caught up,
causing inconsistency on refresh until the indexer mirrors the event.

## Extension: `TokenAllowlistUpdated` (indexer-only, with contract read)

`DonationRouter` emits `TokenAllowlistUpdated { token, added }` when the Admin
calls `add_token` / `remove_token`. The indexer mirrors this into the `tokens`
metadata table:

- On `added = true`: the indexer queries the SAC contract once for `symbol()`,
  `name()`, `decimals()` (and `issuer` if available), then inserts a `tokens`
  row keyed by `contract_address`. The contract read happens only at insert
  time; subsequent reads come from Postgres.
- On `added = false`: the indexer deletes the `tokens` row.
- Same shared cursor, same poll loop, same `getEvents` call as all other
  event types. Dispatch by topic name.
- Idempotent: re-processing `added = true` re-inserts (upsert by
  `contract_address`); re-processing `added = false` re-deletes (no-op if
  already gone).
- Public read on `tokens` so the donate UI can join and render the token
  picker without an RPC call per prepare.
