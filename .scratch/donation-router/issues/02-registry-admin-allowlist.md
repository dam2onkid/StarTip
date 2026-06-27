Status: done
Labels: done

# Registry, admin config, and Token Allowlist

## Parent

`.scratch/donation-router/PRD.md`

## What to build

Implement every non-`donate` state-changing public function on `DonationRouter`, with their events, authorization rules, and TTL extension. This slice delivers the full configuration and registry surface that `donate()` depends on.

**Creator registry (self-service + admin kill-switch):**

- `register_creator(creator_id_hash: BytesN<32>, payout_address: Address)`: caller is the owner, reverts with `AlreadyRegistered` if the Creator ID Hash exists, stores `Creator { owner: caller, payout_address, active: true }`, extends the entry's persistent TTL to ~518400 ledgers (30 days), emits `CreatorRegistered { creator_id_hash, owner, payout_address }`.
- `update_creator_payout(creator_id_hash, new_payout_address)`: reverts with `CreatorNotFound` if missing, `require_auth` on the stored `owner` (else `Unauthorized`), updates `payout_address`, extends TTL, emits `CreatorPayoutUpdated { creator_id_hash, old_payout_address, new_payout_address }`. No payout address validation (ADR-0004); a Creator who points it at the contract address strands funds permanently.
- `set_creator_active(creator_id_hash, active: bool)`: OR-authorization via the non-panicking `Address::requires_auth()` on both the stored `owner` and the `Config.admin`; reverts with `Unauthorized` only if neither returns true. Soroban binds auth to the current call args, so the OR-auth cannot be replayed for a different Creator. Updates `active`, extends TTL, emits `CreatorActiveChanged { creator_id_hash, active }`. This is the Admin's force-pause path for a malicious Creator.

> **Implementation note (2026-06-27):** `soroban-sdk 26.1.0` does not ship the
> non-panicking `Address::requires_auth()` the ADR assumed; only the panicking
> `require_auth()` is available, and `#![no_std]` contracts cannot catch panics.
> To preserve both the owner self-pause and admin force-pause paths without
> OR-auth, the slice ships two functions instead of one:
> `set_creator_active_owner(creator_id_hash, active)` (owner auth) and
> `force_pause_creator(creator_id_hash, active)` (admin auth). Both emit
> `CreatorActiveChanged { creator_id_hash, active }` and extend TTL. This
> deviates from the PRD function surface and ADR-0004's OR-auth decision; the
> ADR should be updated to record the SDK-driven revision.

**Admin configuration (admin-only, via `require_auth(Config.admin)`):**

- `set_treasury_address(new_treasury)`: updates `Config.treasury_address`, extends instance TTL, emits `TreasuryUpdated { old_treasury_address, new_treasury_address }`.
- `set_platform_fee_bps(new_fee_bps)`: reverts with `FeeCapExceeded` if `new_fee_bps > max_fee_bps`, updates `Config.platform_fee_bps`, extends instance TTL, emits `PlatformFeeUpdated { old_fee_bps, new_fee_bps }`.
- `set_paused(paused: bool)`: updates `Config.paused`, extends instance TTL, emits `PausedChanged { paused }`.
- `set_admin(new_admin)`: single-step transfer, `require_auth` on current admin, emits `AdminUpdated { old_admin, new_admin }`. No propose/accept (ADR-0004).

**Token Allowlist (admin-only):**

- `add_token(token: Address)`: appends to `Config.token_allowlist` if absent, extends instance TTL, emits `TokenAllowlistUpdated { token, added: true }`.
- `remove_token(token: Address)`: removes from the allowlist if present, extends instance TTL, emits `TokenAllowlistUpdated { token, added: false }`.

All events are `#[contractevent]` structs so the off-chain indexer can decode them. Every config-touching call extends instance storage TTL; every creator-touching call extends that Creator entry's persistent TTL.

No getters are required for the MVP (ADR-0004). Read-only helpers may be added only if tests need them.

## Acceptance criteria

- [ ] `register_creator` stores a Creator with `owner = caller`, `active = true`, reverts `AlreadyRegistered` on duplicate, extends TTL, emits `CreatorRegistered`.
- [ ] `update_creator_payout` is owner-only (non-owner reverts `Unauthorized`), reverts `CreatorNotFound` on missing entry, updates payout, extends TTL, emits `CreatorPayoutUpdated`. No payout validation is performed.
- [ ] `set_creator_active` uses OR-auth (`requires_auth()` on owner and admin, reverts `Unauthorized` only if neither authorized), updates `active`, extends TTL, emits `CreatorActiveChanged`. Both the owner self-pause and the admin force-pause paths work.
- [ ] `set_treasury_address`, `set_platform_fee_bps`, `set_paused`, `set_admin` are admin-only (non-admin reverts `Unauthorized`), extend instance TTL, and emit `TreasuryUpdated` / `PlatformFeeUpdated` / `PausedChanged` / `AdminUpdated` respectively.
- [ ] `set_platform_fee_bps` reverts with `FeeCapExceeded` when `new_fee_bps > max_fee_bps`.
- [ ] `set_admin` is single-step and emits old and new admin.
- [ ] `add_token` / `remove_token` are admin-only, mutate `Config.token_allowlist`, extend instance TTL, and emit `TokenAllowlistUpdated` with the correct `added` flag.
- [ ] All eight events are `#[contractevent]` structs with the field names listed above.
- [ ] Unit tests cover: every function's happy path, every authorization rule (owner-only, admin-only, OR-auth both branches), `AlreadyRegistered`, `CreatorNotFound`, `FeeCapExceeded`, and event emission with correct fields.

## Blocked by

- `01-scaffold-constructor.md`
