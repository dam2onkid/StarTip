Status: done

## Parent

`/private/var/folders/tk/rmcx56cx2gz8r5jfsgdrnn5m0000gn/T/architecture-review-20260712-142520.html` (StarTip architecture review)

# Migrate donate to the invocation module and delete old transaction builders

## What to build

Migrate the donation flow (`donate()`) to the `DonationRouterInvocation` module,
including the two-op `change_trust` + `donate` path. Then delete the old inline
`loadAccount` / `simulate` / `assemble` / `send` code in all on-chain call sites.

## Acceptance criteria

- [x] The donation flow uses the `DonationRouterInvocation` module for both the
      single-op `donate()` and the two-op `change_trust` + `donate()` paths.
- [x] The donation flow with and without a trustline still passes tests and E2E
      stubs.
- [x] No duplicated transaction-building code remains in the on-chain action
      modules.
- [x] All contract-error decoding and signer checks flow through the invocation
      module.

## Blocked by

- [x] 01 - Create the DonationRouter invocation module and migrate registration + active-creator actions
