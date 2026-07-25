Status: done

# Deliver verified Donation Effects end to end

## What to build

After Stellar ledger verification, match a settled Donation to its locked Effect Intent and issue exactly one pinned Donation Effect Live Event before waiting for the full indexer pipeline. The Live Event Client runs the effect from its bundled Default Pack and displays compact attribution without a Donation message or Alert Reading.

Creator choice wins at settlement. If the Creator disabled Live Events after intent creation, the Worker suppresses the effect with a machine-readable reason and delivers the Donation as an ordinary Donation Alert.

## Acceptance criteria

- [ ] Worker ledger verification matches settled Creator, token, raw amount, Donation reference, and preparation identity to the locked Effect Intent.
- [ ] Effect Intent identity is the idempotency key and cannot produce more than one Donation Effect Live Event.
- [ ] Effect issuance occurs after verified ledger settlement and before waiting for the full indexer pipeline.
- [ ] The issued Live Event pins the exact pack ID, immutable pack version, and effect ID.
- [ ] The Live Event Client resolves only bundled, manifest-validated identifiers and never downloads runtime assets or executable renderer code.
- [ ] The Game Overlay runs the selected effect and displays Donor Name, amount, token symbol, and effect name.
- [ ] Effect Donations exclude the Donation message, ordinary Donation Alert, and Alert Reading.
- [ ] Effect Donations bypass the ordinary alert minimum because eligibility was validated through Effect Price.
- [ ] If Live Events were disabled before settlement, the effect is suppressed with the `creator_disabled` reason and the Donation becomes an ordinary Donation Alert without an automatic refund.
- [ ] Disabling Live Events does not interrupt an effect already running locally.
- [ ] Attempts to substitute client-provided effect data after settlement are rejected or ignored.
- [ ] Public Worker, database integration, shared contract, renderer, and client tests cover successful issuance, duplicate verification, mismatches, suppression, and fallback.

## Blocked by

- Bind a Donor's effect selection into Donation preparation
- Deliver ordinary Donations to the Live Event Client

## Comments

