# 01 - Contract: drop donation_id_hash from donate() + event + tests + integration.sh

Status: done
Role: backend

## Task

Remove `donation_id_hash` from the `DonationRouter` contract per ADR-0005.

## Changes

### `contracts/donation-router/src/lib.rs`

- `donate()`: remove `donation_id_hash: BytesN<32>` parameter. New signature:
  `pub fn donate(env, donor, creator_id_hash, token, amount)`.
- `DonationReceived` struct: remove `pub donation_id_hash: BytesN<32>` field.
  Event construction at line 515-525: drop `donation_id_hash` from the struct
  literal.
- Update doc comment at line 454 ("No on-chain replay tracking for
  `donation_id_hash`") to reflect that the field no longer exists.
- Update all 8 test sites that pass `donation_id_hash` to `donate()`:
  - Lines 1359, 1361, 1372 (donate test + event assertion)
  - Lines 1401, 1403 (CreatorNotFound test)
  - Lines 1425, 1427 (CreatorInactive test)
  - Lines 1451, 1453 (Paused test)
  - Lines 1473, 1477 (InvalidAmount test)
  - Line 1490 (negative amount test)
  - Lines 1516, 1518 (TokenNotAllowed test)
  - Lines 1562, 1563, 1574 (event field assertion)
  - Lines 1615, 1616, 1627 (event field assertion)
  - Lines 1670, 1672 (force_pause test)
- Remove `let donation_id_hash = creator_id_hash(&env, 99);` and similar
  lines that mint a test hash. The `donate()` call no longer needs it.

### `contracts/donation-router/tests/integration.sh`

- Remove `DONATION_ID_HASH` variable (line 48).
- Remove `--donation_id_hash` CLI arg from the `stellar contract invoke
  donate` call (line 219).
- Remove `assert_in_events "donation_id_hash"` assertion (line 287).
- Update the event field count assertion if any (the event now has 7 fields
  instead of 8).

## Verification

- `cd contracts && make test` passes (cargo unit tests).
- `cd contracts && make integration-test` passes (local Docker network,
  event has 7 fields, no `donation_id_hash`).

## Dependencies

- None. This is the first issue; everything else depends on the new contract
  shape.

## Comments

- Review (2026-07-05): verified against current `contracts/donation-router/src/lib.rs`
  — the described `donate()` signature, doc comment, and event struct match
  the live source exactly. Triaged `ready-for-agent`.
- Done (2026-07-05): removed `donation_id_hash` from the `DonationReceived`
  struct, the `donate()` signature, the event construction, and the doc
  comment (now references ADR-0005). Updated all 9 test sites in `src/lib.rs`
  and removed the now-unused `creator_id_hash` mint lines. Updated
  `tests/integration.sh` (dropped `DONATION_ID_HASH` var, CLI arg, assertion,
  and comments). `cargo test --package donation-router`: 35/35 pass. `cargo
  clippy`: clean. `stellar contract build`: WASM builds. Integration test not
  run (Docker unavailable in this environment); script updated and ready.
