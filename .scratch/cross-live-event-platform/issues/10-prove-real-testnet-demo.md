Status: in-progress

# Prove the complete local macOS demo with real testnet Donations

## What to build

Prove the primary Live Event Platform acceptance path using the actual macOS Tauri development app and real testnet Donations. The flow runs from the Donor web experience through test USDC settlement, Worker verification, durable Live Event persistence, Supabase Realtime, Game Overlay presentation, and lifecycle acknowledgement without injecting mock Live Events.

The acceptance run must also verify the Creator and OBS see the same Tauri surface and hear audio through the Creator-configured macOS and OBS routing.

## Acceptance criteria

- [ ] The primary acceptance flow uses a real Overlay ID, Worker, Supabase services, testnet settlement, and Tauri development app.
- [ ] No mock or directly injected Live Event is used in the primary acceptance flow.
- [ ] One ordinary Donation renders immediately with the full Donation Alert and successful Worker Alert Reading.
- [ ] Real Donations exercise Screen Flash, Jump Scare, Tunnel Vision, and Screen Cover through the bundled Default Pack.
- [ ] The Creator and an OBS capture see the same Tauri Game Overlay output.
- [ ] Alert, Alert Reading, and effect audio are verified through the macOS default output and Creator-configured OBS capture.
- [ ] Pointer input reaches a representative windowed or borderless game beneath the transparent Game Overlay.
- [ ] Multiple real Donations prove shared FIFO ordering and one active effect at a time.
- [ ] The run proves the 30-second start deadline and observable missed and expired outcomes.
- [ ] Emergency Stop ends the active effect and queued effects while ordinary Donation Alerts and the Game Overlay continue.
- [ ] Disabling Live Events before settlement suppresses the effect and produces the ordinary Donation Alert fallback.
- [ ] Connection loss, automatic reconnect, Reconnect Now, and no replay are verified.
- [ ] Manual pixel-focused verification covers transparent composition, effect geometry, GIF scaling, menu-bar behavior, and OBS visual and audio capture.
- [ ] Targeted lint, typecheck, Rust format, Rust lint, Rust tests, database migration tests, Web, Worker, and shared suites, browser Playwright coverage, and the Tauri development build pass.
- [ ] Any baseline failure discovered during validation is fixed or explicitly separated with reproducible evidence, while every touched path remains clean and non-flaky.

## Progress

- Fixed Rust formatting in `live-client` and `contracts`.
- Fixed Supabase migration `20260630050000_profile_banner.sql` so `supabase db reset` applies cleanly.
- Added `supabase/seed.sql` and updated RLS test helpers for the local pgTAP version.
- Stabilized the Playwright E2E suite (donate, creator-tab, donor-tab, onboarding, overlay, public-discovery).
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e --workers=1`, `cargo build`, and `supabase db reset` all pass.
- Commit `32dcd40` on `feat/tauri` contains the test/migration fixes.

The runtime demo verification (real testnet Donation through Tauri overlay) is still pending.

## Blocked by

- Let Creators opt into Live Events and publish Effect Prices
- Deliver verified Donation Effects end to end
- Preserve FIFO ordering and terminal lifecycle outcomes
- Make the live client safe during play and network failure
- Move the browser fallback onto the shared Donation Alert renderer

## Comments

