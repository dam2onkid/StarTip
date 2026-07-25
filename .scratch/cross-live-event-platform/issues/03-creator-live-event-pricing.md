Status: ready-for-agent

# Let Creators opt into Live Events and publish Effect Prices

## What to build

Give each Creator an explicit Live Events Enabled setting and four editable Default Pack Effect Prices. Existing Creators remain opted out by default. When enabled, the public Donation flow can discover the current effects and minimum Donation amounts. When disabled, effect choices disappear immediately and the server refuses new Effect Intents.

Effect Price is a minimum total Donation, never a surcharge or separate fee.

## Acceptance criteria

- [ ] Live Events Enabled is stored per Creator and defaults to false for existing and new Creators.
- [ ] The dashboard lets the owning Creator enable or disable Live Events and edit the four Default Pack Effect Prices.
- [ ] Initial prices are 1 test USDC for Screen Flash, 2 for Jump Scare, 3 for Tunnel Vision, and 5 for Screen Cover.
- [ ] Creator-edited prices below the shared 0.10 test USDC platform floor are rejected at every write boundary.
- [ ] Non-owners cannot change another Creator's setting or prices.
- [ ] The public Donation flow can read only the configuration required to present currently available effects and prices.
- [ ] When Live Events are disabled, the donate page offers ordinary Donations only.
- [ ] When Live Events are disabled, the server rejects attempts to create new Effect Intents even if a stale client submits effect data.
- [ ] The dashboard does not expose effect intensity, duration, geometry, cooldown, media, volume, pack management, or other out-of-scope controls.
- [ ] Database and browser tests cover defaults, ownership isolation, validation, live visibility changes, and server-side opt-in enforcement.

## Blocked by

None - can start immediately.

## Comments

