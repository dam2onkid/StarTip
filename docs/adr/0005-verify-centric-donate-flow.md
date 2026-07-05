# Verify-centric donate flow: drop prepare, drop donation_id_hash, tx_hash as sole key

## Context

ADR-0001 committed `donation_id_hash = sha256(donation_id)` on-chain as the
link between a `DonationReceived` event and its off-chain record. ADR-0003
introduced a two-path write model: a `prepare` endpoint inserts a `pending`
row (minting the hash), the client builds and signs `donate(...,
donation_id_hash)`, then a `confirm` endpoint matches the event back to the
pending row by hash and promotes it to `confirmed`. An indexer reconciles
missed donations.

This is over-engineered for the actual problem. The `donation_id_hash` serves
no on-chain purpose (the contract does not track replays, ADR-0004) and no
off-chain purpose once `tx_hash` is available, because `tx_hash` is unique per
donation by Stellar's guarantee and already has a unique constraint in
`donations`. The `prepare` endpoint exists only to mint the hash and insert a
pending row before the tx is signed, but a pending row created before the tx
exists is the source of the orphan-row problem ADR-0003 then has to reconcile
around. The confirm path's match-by-hash logic is strictly more complex than
match-by-tx_hash, for zero security benefit.

## Decision

**Drop `donation_id_hash` from the contract entirely.** `donate()` becomes
`donate(env, donor, creator_id_hash, token, amount)`. The `DonationReceived`
event drops the `donation_id_hash` field, leaving 7 fields. The contract is
redeployed (dev state, no prod data to migrate). Supersedes the
`donation_id_hash` decision in ADR-0001 and the two-path pending/confirm shape
in ADR-0003.

**Drop the `prepare` endpoint.** No pending row, no pre-mint. The client
validates input locally (amount > 0, message/donor_name length) and validates
the creator via the `public_profiles` view (empty = not donatable) and the
`tokens` table (allowlist). Contract reverts (`Paused`, `TokenNotAllowed`,
`CreatorInactive`) handle race conditions the client could not see. The client
builds `donate(donor, handle_hash, token, amount)` using `contract_id` from
env and `handle_hash = sha256(handle)` computed locally.

**Verify is the single write path in the happy flow.** After the wallet
submits `donate()`, the client posts `{tx_hash, message, donor_name}` to
`/api/donations/verify` (a Next.js route proxying to the verify worker,
ADR-0006). The worker polls `getTransaction(txHash)` until the tx is visible,
verifies it succeeded, parses `DonationReceived`, checks the contract id,
extracts the donor address from the tx source, and upserts the donation by
`tx_hash` as `confirmed`. The response is sync: 200 + `{status: "confirmed"}`
on success, 409 on tx failure or event mismatch, 404 if the tx is not found
within the poll window. If the tx is not yet visible when the poll window
expires, the response is 202 and the indexer catches the row later.

**The indexer remains as the safety net.** If the client closes the tab before
verify returns, or the tx is slow to confirm, the indexer inserts an `indexed`
row by `tx_hash` with default `message = NULL` and `donor_name = "Anonymous"`
(the on-chain event carries no off-chain content). If verify arrives after the
indexer, it promotes `indexed` -> `confirmed` and fills `message`/`donor_name`
from the request body. Both paths upsert by `tx_hash`, so concurrent writes
converge. This preserves ADR-0003's idempotency guarantee while removing the
pending state.

**Off-chain content (message, donor_name) is trusted from the client.** The
on-chain event cannot verify message content (ADR-0001 deliberately omitted
`message_hash` so moderation can edit/hide messages). The client sends
`message` and `donor_name` in the verify request body, the worker stores them
as-is, and moderation (`classifyMessage`) runs at insert time. Spam or gaming
of message content is handled by moderation + rate-limiting, not by on-chain
verification. Message is not a fund-safety primitive.

**`tx_hash` is the sole natural key for a donation.** `donations.id` (UUID)
remains the primary key for internal references and stable URLs
(`/donation/<id>`), but `tx_hash` is the unique constraint the verify and
indexer paths converge on. The `donation_id_hash` column and its index are
dropped. The `status` column is constrained to `confirmed` / `indexed` via a
CHECK constraint; `pending` no longer exists.

## Considered Options

- **Keep prepare, keep donation_id_hash (status quo).** Rejected. The hash is
  dead weight on-chain and the pending row is the root cause of the orphan-row
  complexity ADR-0003 works around. Confirm-by-hash is strictly more complex
  than confirm-by-tx_hash for zero benefit.
- **Keep donation_id_hash, drop pending (prepare mints but does not insert).**
  Rejected. If prepare does not insert, the hash has no off-chain row to link
  to, so it is pure dead weight on-chain. Dropping the hash is strictly
  simpler.
- **Client mints donation_id_hash.** Rejected. Lets the client pick the hash,
  which is a minor trust concern, but more importantly it is unnecessary:
  `tx_hash` is already unique and available.
- **Add message_hash on-chain for verifiable content.** Rejected. Contradicts
  ADR-0001's moderation policy (messages can be edited/hidden). Re-introduces
  the immutability lie. Message is not fund-safety-relevant.
- **Confirm-only (no indexer).** Rejected. A donation whose verify call never
  fires (closed tab, network drop) would be on-chain but absent from Supabase
  forever, breaking the overlay and dashboard. The indexer is cheap and
  catches this case.
- **Indexer-only (no verify).** Rejected. Overlay latency bounded by the poll
  interval (10s) makes live-demo alerts feel sluggish. Verify gives
  sub-second-to-few-seconds latency for the happy path.

## Consequences

- **Contract change is breaking.** `donate()` signature and `DonationReceived`
  event shape change. Redeploy required. All clients and indexers must be
  updated in lockstep. Acceptable in dev; would require a migration plan in
  prod.
- **`donations.donation_id_hash` column and index are dropped.** Any code
  referencing the column (confirm, indexer dispatch, prepare) must be updated.
  The `pending` status is removed by CHECK constraint; existing pending rows
  (test data) are deleted in the migration.
- **Client-side validation is the first gate, not server-side.** A malicious
  client can skip validation and submit a tx that the contract will revert,
  wasting the donor's gas. This is acceptable: the contract is the security
  boundary, and the client validation is UX, not security.
- **Off-chain content trust.** The worker trusts the client's
  `message`/`donor_name` because it cannot verify them on-chain. A malicious
  client could attach a message to a donation that the donor did not intend.
  Mitigation: moderation can hide, rate-limiting can throttle, and the message
  is not a fund-safety primitive. If verifiable content is needed post-MVP,
  a `content_hash` could be added to the event, but that re-opens the
  moderation edit problem.
- **Verify poll window.** The worker polls `getTransaction` for a bounded
  window. If the tx is not visible within the window, verify returns 202 and
  the indexer catches the row. The client should subscribe to Supabase
  Realtime on the `donations` row by `tx_hash` to show success when the row
  appears, rather than relying solely on the verify response.
- **ADR-0001's donation_id_hash decision is superseded.** The rest of ADR-0001
  (on-chain/off-chain split, `sha256(handle)` as creator key, self-register,
  `token.transfer` + `require_auth(donor)`) stands.
- **ADR-0003's two-path shape is preserved but simplified.** The confirm path
  becomes the verify path (no pending, no hash match). The indexer path is
  unchanged in mechanism (upsert by tx_hash) but drops the hash-based
  matching. The `pending` -> `confirmed`/`indexed` transition becomes
  `confirmed`/`indexed` only.
