Status: done

## Parent

`/private/var/folders/tk/rmcx56cx2gz8r5jfsgdrnn5m0000gn/T/architecture-review-20260712-142520.html` (StarTip architecture review)

# Extract the DonationFlow state machine and migrate DonateForm to it

## What to build

A `DonationFlow` module that models the donor's journey through the
`idle -> submitting -> confirming -> success / error` phases. The module delegates
to adapter seams for on-chain invocation, trustline checking, and verify polling.
Then migrate the `DonateForm` to be a thin UI adapter that renders the
`DonationFlow` state and collects input. Move token allowlist loading and trustline
state into focused hooks.

## Acceptance criteria

- [x] The `DonationFlow` module exists and can be driven by injected fake
      adapters in unit tests.
- [x] Phase transitions and error mapping are centralized in the module.
- [x] The `DonateForm` renders the `DonationFlow` state and collects input.
- [x] The donation form still works end-to-end from amount entry to
      confirmation.
- [x] The `DonateForm` module is significantly smaller and no longer encodes the
      full phase machine.

## Blocked by

- 02 - Migrate donate to the invocation module and delete old transaction builders
