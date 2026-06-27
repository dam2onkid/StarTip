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
