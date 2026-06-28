Status: done
Labels: done

# Local-network integration test

## Parent

`.scratch/donation-router/PRD.md`

## What to build

One integration test that builds the WASM, deploys the contract to a local Stellar network with constructor args, and runs a real end-to-end Donation against a real SAC token. This seam exists only to catch build, deploy, CLI encoding, and real SAC token regressions; behavior coverage already lives in the unit tests from the prior slices.

The test (Rust using `soroban-env-host` testutils against a local `stellar network container`, or a shell script invoking `stellar contract deploy` and `stellar contract invoke` against a local network) must:

1. Build the contract WASM via `stellar contract build`.
2. Start a local network (`stellar network container`).
3. Deploy with constructor args: `--admin <addr> --treasury_address <addr> --platform_fee_bps <n> --max_fee_bps 500`, so initialization is atomic at deploy time (CAP-0058).
4. As the Admin, call `add_token` for a real SAC token contract address on the local network (e.g. the native XLM SAC or a wrapped token).
5. As a Creator, call `register_creator` with a Creator ID Hash and Payout Address.
6. As a Donor, call `donate` with that Creator ID Hash, the allowed token, an amount, and a Donation ID Hash, with donor auth.
7. Assert the `DonationReceived` event is visible via `stellar event` (or the equivalent testutils event read) and carries the expected fields.

This is the only test that exercises the real build/deploy/CLI-encoding/SAC path. It does not re-cover behavior branches.

## Acceptance criteria

- [x] The integration test builds the WASM with `stellar contract build`.
- [x] The test deploys to a local network with constructor args (atomic init via `__constructor`).
- [x] The test calls `add_token` for a real SAC token, `register_creator`, and `donate` end-to-end via the CLI or testutils.
- [x] The test asserts `DonationReceived` is emitted and visible via `stellar event` (or equivalent).
- [x] The test passes against a fresh local network.

## Blocked by

- `03-donate-settlement.md`
