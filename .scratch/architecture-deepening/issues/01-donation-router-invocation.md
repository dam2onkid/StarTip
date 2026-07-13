Status: done

## Parent

`/private/var/folders/tk/rmcx56cx2gz8r5jfsgdrnn5m0000gn/T/architecture-review-20260712-142520.html` (StarTip architecture review)

# Create the DonationRouter invocation module and migrate registration + active-creator actions

## What to build

A deep `DonationRouterInvocation` module that hides the full transaction lifecycle
(get account, build contract call, simulate, assemble, sign, submit, and signer
mismatch checks) behind a small interface. Migrate `register_creator`,
`update_creator_payout`, and `set_creator_active_owner` to use this module.
The old inline transaction builders for those three paths remain in place until
ticket 02 deletes them.

## Acceptance criteria

- [x] The `DonationRouterInvocation` module exists with a small interface that
      accepts method, args, optional pre-operations, signer, and network config.
- [x] The module returns the transaction result and handles `simulate`,
      `assembleTransaction`, signer-mismatch checks, and `sendTransaction`.
- [x] Unit tests exercise the module with a fake RPC seam.
- [x] Registration, payout update, and pause/unpause flows still pass existing
      tests and E2E stubs.
- [x] The two-op `change_trust` + `donate` path is not yet migrated in this
      ticket.

## Blocked by

- None — can start immediately.
