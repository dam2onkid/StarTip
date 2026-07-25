Status: done

# Bind a Donor's effect selection into Donation preparation

## What to build

Extend the Donation journey so a Donor can optionally preview and select one available Donation Effect before signing. The server creates a single-use, expiring Effect Intent that binds the exact Creator, token, minimum amount, Default Pack version, effect, Donation preparation identity, and expiry.

The entire submitted amount remains a Donation. Effect Price is only the minimum Donation needed to select the effect.

## Acceptance criteria

- [x] No effect is the default choice.
- [x] When Live Events are enabled, the donate page presents exactly the four Default Pack effects, previews, and current minimum prices.
- [x] Selecting an effect raises an entered amount below its minimum to the current Effect Price.
- [x] Deselecting or changing an effect never silently reduces the amount the Donor entered.
- [x] A Donor may contribute more than the selected effect's minimum and the entire amount follows the normal Donation settlement.
- [x] The final Pay & Donate confirmation displays Creator, token, total amount, and selected effect before approval.
- [x] The server creates the Effect Intent before signature and binds Creator, token, raw minimum amount, pack ID, pack version, effect ID, Donation preparation identity, and expiry.
- [x] Effect Intent data remains off-chain and requires no DonationRouter or contract ABI change.
- [x] An Effect Intent is single-use, expires, and cannot be rebound to a different Donation preparation or effect.
- [x] Client-submitted effect metadata cannot override the locked Effect Intent after it is created.
- [x] Public contract and database tests cover amount behavior, price races, expiry, one-use consumption rules, malformed identifiers, and preparation binding.

## Blocked by

- Render the signed Default Pack through shared components
- Let Creators opt into Live Events and publish Effect Prices

## Comments
