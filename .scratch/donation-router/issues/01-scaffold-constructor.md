Status: done
Labels: done

# Scaffold crate and ship the constructor

## Parent

`.scratch/donation-router/PRD.md`

## What to build

Stand up the `DonationRouter` Soroban contract crate as a new `contracts/` Cargo workspace at the repo root, separate from the Next.js app. The crate is a `cdylib` producing Soroban WASM.

This is the prefactor slice: it establishes the build pipeline, the storage type shapes, the typed error vocabulary, and atomic initialization so every later slice can land on a stable foundation.

Crate baseline (ADR-0004): pin `soroban-sdk = 26.1.0`, MSRV 1.91.0. `testutils` is a dev-dependency for unit tests. Release profile uses `opt-level = "z"`, `overflow-checks = true`, `lto = true`, `panic = "abort"`.

Define the storage shapes the rest of the contract will build on:

- A packed `Config` struct in instance storage: `admin: Address`, `treasury_address: Address`, `platform_fee_bps: u32`, `max_fee_bps: u32`, `paused: bool`, `token_allowlist: Vec<Address>`.
- A `DataKey` enum with one variant, `Creator(BytesN<32>)`, for the persistent Creator map.
- A `Creator` struct: `owner: Address`, `payout_address: Address`, `active: bool`.

Define the typed `#[contracterror]` enum that all later slices will revert with: `Unauthorized`, `Paused`, `CreatorNotFound`, `CreatorInactive`, `InvalidAmount`, `TokenNotAllowed`, `FeeCapExceeded`, `AlreadyRegistered`. No bare `panic!` with strings anywhere in the crate.

Implement the CAP-0058 `__constructor(admin, treasury_address, platform_fee_bps, max_fee_bps)`. It validates `platform_fee_bps <= max_fee_bps` (reverting with `FeeCapExceeded` otherwise), stores the packed `Config` with `paused = false` and an empty `token_allowlist`, and extends the instance storage TTL. `max_fee_bps` has no setter for the life of the contract, it is the immutable trust anchor.

`stellar contract build` must produce the WASM artifact.

## Acceptance criteria

- [ ] `contracts/donation-router/` exists as a Cargo workspace, separate from the Next.js app at the repo root.
- [ ] `soroban-sdk = 26.1.0` is pinned; `testutils` is a dev-dependency; release profile matches ADR-0004.
- [ ] `Config`, `DataKey` (with `Creator(BytesN<32>)` variant), and `Creator` structs are defined.
- [ ] The typed `#[contracterror]` enum is defined with all eight variants and no `panic!`-string reverts exist in the crate.
- [ ] `__constructor` stores `Config`, validates `platform_fee_bps <= max_fee_bps` (reverts with `FeeCapExceeded`), sets `paused = false` and empty `token_allowlist`, and extends instance TTL.
- [ ] `max_fee_bps` has no setter; it cannot change after construction.
- [ ] `stellar contract build` succeeds and produces the WASM.
- [ ] A unit test constructs the contract with valid args and asserts the stored config reads back correctly; another test asserts `platform_fee_bps > max_fee_bps` reverts with `FeeCapExceeded`.

## Blocked by

- None - can start immediately
