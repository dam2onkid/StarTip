# On-chain/off-chain split and Creator identity model

## Context

StarTip is a hybrid Stellar + Supabase app. We need to decide what the
DonationRouter contract is responsible for, how Creators are identified on-chain,
and how on-chain events link to off-chain records. These choices are hard to
reverse after the contract is deployed and shape every downstream flow
(onboarding, donate, overlay, moderation).

## Decision

**On-chain scope is intentionally narrow.** The contract holds only
trust-minimized state: Creator registry (Handle hash → owner + payout address),
Platform Fee config, Treasury address, the `paused` switch, and per-Donation
settlement + `DonationReceived` event. Full message, donor name, leaderboard,
overlay, moderation, and dashboard data live in Supabase.

**Creator on-chain identity is `sha256(handle)`.** The Handle is the unique
human-readable slug used in URLs; its hash is the contract key. Supabase does
not store a separate `creator_id_hash` column, it is derived.

**`register_creator` is self-service.** The caller authenticates as the
Creator's owner (`require_auth`), so the owner address is the invoker, not an
argument. The backend never holds an admin key for Creator onboarding; the admin
key is only for fee/treasury/pause config. This means a Creator must sign one
on-chain transaction at onboarding, which also proves they control the owner
address.

**Only `donation_id_hash` is committed on-chain per Donation.** `message_hash`
is intentionally omitted: moderation can edit or hide a message, so binding the
message hash on-chain would either break under moderation or lie about
immutability. `donation_id_hash` is sufficient to link the on-chain event to the
off-chain record. The backend computes the hash in
`/api/donations/prepare`, stores a pending row, returns the hash to the client,
and verifies it against the on-chain event at confirm time.

**Token transfer uses `token.transfer` + `require_auth(donor)`.** No
`approve`/`transfer_from` step. The donor signs `donate()` once and Soroban's
auth propagation covers the nested token transfers. This is the idiomatic
Soroban pattern and gives a one-transaction donor UX.

## Considered Options

- **Creator key = `sha256(uuid)`** (original spec): rejected. UUIDs are not
  sensitive, so hashing them adds indirection without privacy. Hashing the
  Handle keeps the on-chain identity 1:1 with the user-facing identifier.
- **Creator key = raw Handle string**: rejected. Opaque 32-byte key is cheaper
  on-chain and does not leak the slug in storage scans.
- **Admin-register** (original spec): rejected. Forces the backend to hold a hot
  admin key for user onboarding and breaks self-custody ethos. Self-register
  shifts one signing step to the Creator (a power user) and removes the hot key.
- **Keep `message_hash` on-chain**: rejected. Contradicts moderation policy
  (messages can be edited/hidden) and adds a field, a compute step, a verify
  step, and a column for no load-bearing security benefit.
- **`transfer_from` + `approve`**: rejected. EVM-style, two transactions, worse
  donor UX, not idiomatic Soroban.

## Consequences

- `streams` table is out of MVP scope. Donations belong to a Creator, the
  Overlay is per-Creator (`/overlay/[handle]`). Per-stream goals/leaderboards
  are a post-MVP feature and will require a migration when added.
- Onboarding flow: Supabase profile (Handle reserved) → connect wallet → sign
  `register_creator(sha256(handle), payout_address)` → backend indexes
  `CreatorRegistered` and links to the Supabase profile. The backend must
  handle orphan on-chain registrations (hash with no Supabase match) gracefully.
- The contract must validate that the `token` argument is a legitimate SAC token
  address, not an arbitrary contract, to avoid malicious token contracts.
- Moderation is free to mutate the off-chain message without breaking any
  on-chain invariant.
