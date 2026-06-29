# DonationRouter implementation decisions

## Context

`docs/specs.md` §9 specifies the `DonationRouter` contract surface at the spec
level: storage shape, public functions, donate logic, events, authorization
table. Several implementation decisions were left open or stated only as
guidance ("validate token is a legitimate SAC token address", "`__constructor`
or guarded initialize", "`max_fee_bps` caps admin fee changes"). These
decisions are hard to reverse after the contract is deployed and shape the
security posture and the off-chain indexer contract, so they are recorded here.

This ADR covers the decisions reached in the grilling session that produced the
implementation plan: token validation, fee cap mutability, the
`set_creator_active` authorization model (originally OR-auth, later revised to
a two-entrypoint split, see Decision), `donation_id_hash` replay handling,
zero-transfer handling, payout address validation, storage TTL, admin key
rotation, and the SDK / constructor baseline.

## Decision

**SDK baseline.** Pin `soroban-sdk = 26.1.0` (latest stable, MSRV 1.91.0). Use
the CAP-0058 `__constructor` for one-shot atomic initialization at deploy. No
guarded `initialize()` function. The contract lives in a `contracts/` Cargo
workspace at the repo root, separate from the Next.js app.

**Token validation: on-chain allowlist.** The contract stores a `Vec<Address>`
of accepted SAC token contract addresses in instance storage. `donate()` reverts
if the `token` argument is not in the allowlist. The Admin maintains the list
via `add_token(Address)` and `remove_token(Address)`, each emitting
`TokenAllowlistUpdated { token, added: bool }`. This is the only mechanism that
prevents a malicious token contract (one that imitates the `token::Client`
interface) from being passed to `donate()` and producing a misleading
`DonationReceived` event. The off-chain UI asset selector is derived from this
list but the on-chain list is the source of truth.

**`max_fee_bps` is immutable after construction.** Set only in `__constructor`,
no setter. This makes the cap a permanent trust anchor: the Admin can never push
the Platform Fee above the original cap, even with a compromised admin key. A
mutable cap would be theatre, the admin could raise the cap then raise the fee
in two transactions.

**`set_creator_active` is split into two role-scoped entrypoints.** The spec
authorization table says "Creator's owner OR admin." Rather than expressing OR
inside a single function via the non-panicking
`Address::requires_auth()` (returns `bool`) pattern, the contract exposes two
entrypoints, each with one role and one explicit auth path:

- `set_creator_active_owner(caller, creator_id_hash, active)` —
  `caller.require_auth()`, then `creator.owner == caller` check. Creator
  self-service pause/unpause.
- `force_pause_creator(caller, creator_id_hash, active)` —
  `caller.require_auth()`, then `config.admin == caller` check. Admin
  kill-switch.

Both share a private `set_creator_active_inner(check_owner: bool)` body that
mutates the entry, extends TTL, and emits `CreatorActiveChanged`. The event
shape is identical for both paths, so the indexer does not need to distinguish
who paused.

This was revised from the original OR-auth design. Reasons for the revision:
role separation is explicit at the API surface (the function name tells you
who is authorized), each entrypoint uses the standard panicking `require_auth()`
instead of the less common bool-returning variant, and the auth reasoning per
entrypoint is single-role (simpler to audit). The spec's "owner OR admin"
semantics are preserved: an owner can self-pause, an admin can force-pause, and
neither can act on the other's role. Soroban still binds authorization to the
called entrypoint's arguments, so an authorization cannot be replayed against
the other entrypoint or a different Creator.

**No on-chain replay tracking for `donation_id_hash`.** The contract does not
track which `donation_id_hash` values it has seen. Replay protection is an
off-chain concern: the `donations` table has a unique constraint on
`donation_id_hash`, and the indexer rejects orphan events whose hash matches an
existing row. On-chain tracking would require one persistent storage entry per
Donation forever, violating the "no unbounded storage growth" principle
(spec §14.1). The `donation_id_hash` is a link, not a fund-safety primitive; the
funds move correctly regardless.

**Skip zero-amount transfers.** In `donate()`, the fee transfer is skipped when
`fee_amount == 0` (i.e. `platform_fee_bps == 0`) and the net transfer is skipped
when `net_amount == 0`. This avoids emitting zero-transfer events and avoids
reverting on token contracts that reject zero-amount transfers. The
`DonationReceived` event still reports the true `fee_amount` and `net_amount`.

**No payout address validation.** `register_creator` and
`update_creator_payout` do not validate `payout_address` against the contract
address, the Treasury, or any other value. This is a deliberate trade-off: a
Creator who sets `payout_address` to the contract address will permanently
strand net funds in the contract (there is no withdrawal function). The
alternative (rejecting `payout_address == current_contract_address()`) was
considered and rejected to keep the contract minimal; the risk is documented
and the off-chain UI should warn the Creator before submission.

**Storage TTL: extend-on-access.** Every code path that reads or writes a
Creator's persistent entry extends its TTL to ~518400 ledgers (30 days):
`register_creator`, `update_creator_payout`, `set_creator_active_owner`,
`force_pause_creator`, and `donate()`. Instance storage TTL is extended on
every call that touches config.
This keeps the registry alive without requiring Creators or the backend to run
a separate bump job. There is no manual `bump_creator` function.

**Admin key rotation: single-step `set_admin`.** The Admin can call
`set_admin(new_admin: Address)` to transfer the admin role; the function emits
`AdminUpdated { old_admin, new_admin }`. Single-step (no propose/accept) is
acceptable for the MVP; a compromised admin can self-replace, but the
alternative (two-step) adds a second transaction and a pending-admin state for
no real protection against a compromised admin.

**Error handling: typed `#[contracterror]` enum.** All reverts use a typed
error enum (`Unauthorized`, `Paused`, `CreatorNotFound`, `CreatorInactive`,
`InvalidAmount`, `TokenNotAllowed`, `FeeCapExceeded`, etc.) rather than bare
`panic!` strings, so the off-chain confirm and indexer paths can decode revert
reasons.

## Considered Options

- **Token validation: off-chain allowlist only.** Rejected. The contract would
  trust whatever `token` the donor passes; a malicious donor could pass a fake
  token contract to produce a `DonationReceived` event with a real-looking
  `amount` that the indexer would record before the confirm path verifies real
  transfers. The event is emitted before any off-chain check can run.
- **Token validation: interface probe (`try_call decimals/symbol`).** Rejected.
  A malicious contract can implement those too; the probe is theatre.
- **`max_fee_bps` admin-settable.** Rejected. The cap becomes advisory; a
  compromised or rogue admin can raise both the cap and the fee.
- **`set_creator_active` owner-only or admin-only (single entrypoint).** Both
  rejected. Owner-only loses the Admin kill-switch on a malicious Creator.
  Admin-only removes Creator self-service (an owner cannot unpause themselves
  after the Admin force-paused them). Both capabilities must exist; the
  question is how to expose them.
- **`set_creator_active` single entrypoint with OR-auth via non-panicking
  `requires_auth()`.** Originally chosen, later revised. The bool-returning
  `requires_auth()` pattern is less common, harder to audit, and bundles two
  roles into one function so the API surface does not communicate who is
  authorized. Replaced by the two-entrypoint split (see Decision above).
- **`set_creator_active_owner` + `force_pause_creator` (two role-scoped
  entrypoints).** Chosen. Each entrypoint has one role and one explicit
  `require_auth()` path, the function name communicates the authorized caller,
  and the shared `set_creator_active_inner` body keeps the mutation logic
  single-sourced. Matches spec §9.6's "owner OR admin" semantics via two
  distinct entrypoints rather than OR-logic inside one.
- **On-chain replay set (persistent or temporary TTL).** Both rejected.
  Persistent is unbounded storage; temporary TTL is a half-measure that only
  catches immediate replays. The DB unique constraint is the correct boundary.
- **Always transfer (no zero-skip).** Rejected. Creates zero-transfer events
  and can revert on non-standard token contracts.
- **Reject `payout_address == contract address`.** Considered. Would prevent
  permanent fund stranding. Rejected to keep the contract minimal; the risk is
  documented and handled in the off-chain UI instead.
- **Manual TTL bump / no TTL management.** Both rejected. Manual adds a failure
  mode (Creator archived because they forgot to bump). No management risks
  archive after 30 days of inactivity, breaking `donate()`.
- **Two-step `set_admin`.** Rejected for the MVP. Adds a pending-admin state
  and a second transaction without real protection against a compromised admin.
- **Guarded `initialize()` instead of `__constructor`.** Rejected. Adds a
  redundant init transaction and a front-running window; `__constructor` is
  atomic at deploy.

## Consequences

- The contract gains two admin functions (`add_token`, `remove_token`) and one
  admin function (`set_admin`) beyond the spec's original list, plus three new
  events (`TokenAllowlistUpdated`, `AdminUpdated`, and the existing
  `CreatorActiveChanged` / `PlatformFeeUpdated` / `TreasuryUpdated` /
  `PausedChanged` are kept). `docs/specs.md` §9 is updated to reflect this.
- The spec's single `set_creator_active` is implemented as two entrypoints
  (`set_creator_active_owner` + `force_pause_creator`) sharing one private
  body. The off-chain dashboard and admin tooling must call the correct
  entrypoint for the actor: the Creator's owner uses
  `set_creator_active_owner`, the Admin uses `force_pause_creator`. Both emit
  the same `CreatorActiveChanged` event, so the indexer and overlay need no
  change.
- The Admin must add the XLM SAC and USDC testnet SAC addresses to the
  allowlist before any `donate()` can succeed. This is a one-time post-deploy
  step documented in the deploy runbook.
- `max_fee_bps` immutability means the cap must be chosen carefully at deploy.
  The MVP default is `500` (5%). Changing it requires redeploying the contract.
- The off-chain indexer and confirm paths must decode the typed error enum to
  surface reverts (e.g. `TokenNotAllowed`) to the UI.
- The off-chain UI should warn the Creator when `payout_address` equals the
  contract address or the Treasury, since the contract will not reject it.
- The indexer remains the authority for `donation_id_hash` uniqueness; a
  duplicate hash from a replayed `donate()` is rejected at insert time, not on
  chain.
- Storage TTL is extended on every access, so active Creators never archive.
  A Creator who receives no donations for 30 days and is never re-registered
  will archive; the next `donate()` to them reverts and the backend must
  surface a "Creator archived, needs restore" state. This is an acceptable
  edge case for the MVP.
