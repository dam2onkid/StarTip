Status: done
Labels: done

# Donate settlement path

## Parent

`.scratch/donation-router/PRD.md`

## What to build

Implement `donate(creator_id_hash: BytesN<32>, token: Address, amount: i128, donation_id_hash: BytesN<32>)`, the core financial settlement path and the only function that moves tokens. This is the tracer bullet that cuts through the whole contract: validation, fee split, SAC transfers, TTL, and the `DonationReceived` event the off-chain indexer and confirm path depend on.

Logic, in order:

1. `require_auth` on the caller (the Donor).
2. Revert with `Paused` if `Config.paused`.
3. Load the Creator entry; revert with `CreatorNotFound` if absent.
4. Revert with `CreatorInactive` if `Creator.active == false`.
5. Revert with `InvalidAmount` if `amount <= 0`.
6. Revert with `TokenNotAllowed` if `token` is not in `Config.token_allowlist`.
7. Compute `fee_amount = amount * Config.platform_fee_bps / 10_000` and `net_amount = amount - fee_amount`.
8. Skip the fee transfer when `fee_amount == 0`; skip the net transfer when `net_amount == 0` (ADR-0004). This avoids zero-transfer events and avoids reverting on token contracts that reject zero amounts.
9. When not skipped, transfer via `token::Client::transfer(from: donor, to: Config.treasury_address, amount: fee_amount)` and `token::Client::transfer(from: donor, to: Creator.payout_address, amount: net_amount)`. Soroban auth propagation covers the nested token calls so the Donor signs once, no `approve`/`transfer_from`.
10. Extend the Creator entry's persistent TTL and the instance storage TTL.
11. Emit `DonationReceived { creator_id_hash, token, amount, fee_amount, net_amount, treasury_address, payout_address, donation_id_hash }`.

No on-chain replay tracking for `donation_id_hash` (ADR-0004); replay protection is off-chain via the `donations` table unique constraint. No per-Donation storage.

The event schema is the integration contract with the off-chain indexer and confirm path: field names, order, and types must match `PRD.md` user story 29 exactly.

Unit tests use `soroban-sdk` testutils: `Env::default()`, `register_test_contract`, mock addresses with `Address::simulate_auth_for` / testutils auth, and the SDK's mock token test contract to drive `donate()`. Tests cover every donate logic branch and every authorization rule (PRD user story 37):

- paused contract reverts `Paused`
- missing creator reverts `CreatorNotFound`
- inactive creator reverts `CreatorInactive`
- zero / negative amount reverts `InvalidAmount`
- token not in allowlist reverts `TokenNotAllowed`
- fee split math (`fee_amount = amount * bps / 10_000`, `net_amount = amount - fee_amount`)
- zero-fee skip (no fee transfer emitted when `platform_fee_bps == 0`)
- zero-net skip (no net transfer emitted when `net_amount == 0`)
- `DonationReceived` emitted with all nine fields matching the expected values
- donor auth required (unset auth reverts)
- TTL extension on the Creator entry and instance storage after a successful donate

## Acceptance criteria

- [ ] `donate` requires Donor auth and reverts `Unauthorized` without it.
- [ ] `donate` reverts `Paused` when the contract is paused.
- [ ] `donate` reverts `CreatorNotFound` for an unregistered Creator ID Hash.
- [ ] `donate` reverts `CreatorInactive` for a Creator with `active == false`.
- [ ] `donate` reverts `InvalidAmount` for `amount <= 0`.
- [ ] `donate` reverts `TokenNotAllowed` for a token not in the allowlist.
- [ ] Fee split math is correct: `fee_amount = amount * platform_fee_bps / 10_000`, `net_amount = amount - fee_amount`.
- [ ] Fee transfer is skipped when `fee_amount == 0`; net transfer is skipped when `net_amount == 0`; no zero-amount token transfers occur.
- [ ] Non-skipped transfers move `fee_amount` to `Config.treasury_address` and `net_amount` to `Creator.payout_address` via `token::Client::transfer` with the Donor as `from`.
- [ ] The Donor signs once; nested token transfers succeed via Soroban auth propagation (no `approve`/`transfer_from`).
- [ ] Creator entry TTL and instance storage TTL are extended on a successful donate.
- [ ] `DonationReceived` is emitted with `creator_id_hash, token, amount, fee_amount, net_amount, treasury_address, payout_address, donation_id_hash` in that field set.
- [ ] No on-chain replay tracking is added; no per-Donation storage is written.
- [ ] Unit tests cover every branch listed above and assert event fields, using the SDK mock token contract.

## Blocked by

- `02-registry-admin-allowlist.md`
