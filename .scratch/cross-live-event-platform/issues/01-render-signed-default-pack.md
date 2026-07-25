Status: done

# Render the signed Default Pack through shared components

## What to build

Create the shared, platform-independent foundation for Donation Effect presentation. A consumer must be able to validate the bundled, immutable Default Pack and render each declared effect through reusable Overlay Renderer components without loading remote executable code or assets.

The Default Pack contains exactly Jump Scare, Screen Flash, Screen Cover, and Tunnel Vision. Its manifest pins stable pack, version, effect, asset, duration, scaling, audio, and safety metadata. Runtime input may select only identifiers contained in the validated manifest.

## Acceptance criteria

- [ ] The shared Effect Packs contract rejects invalid signatures, hashes, versions, undeclared effects, undeclared assets, remote asset URLs, and executable pack content.
- [ ] The bundled Default Pack has an immutable version identifier and contains exactly the four specified Donation Effects.
- [ ] Jump Scare selects uniformly from bundled images and GIFs, allows consecutive repeats, centers media at no more than 80% of the display, caps static media at two seconds and GIFs at four seconds, and plays optional bundled audio at 70% volume.
- [ ] Screen Flash fades through white once over one second without a repeating strobe.
- [ ] Screen Cover obscures the central 70% of the display for three seconds while leaving the perimeter visible.
- [ ] Tunnel Vision leaves a central circular view of approximately 35% of display width for five seconds.
- [ ] Shared renderer components support ordinary Donation Alerts and compact effect attribution containing Donor Name, amount, token symbol, and effect name.
- [ ] Compact effect attribution excludes the Donation message and Alert Reading.
- [ ] Renderer and manifest contract tests use deterministic clocks and the real Default Pack.
- [ ] Jump Scare tests replace only the random-number source and prove every asset can be selected and consecutive repetition is accepted.

## Blocked by

None - can start immediately.

## Comments

- 2026-07-25: Implemented in commit 66aec51. Added `packages/shared/src/overlay/effect-packs.ts` (manifest/signature/hash contract), `default-pack.ts` (bundled signed Default Pack), `renderer.ts` (deterministic render planner), and corresponding tests. Full `pnpm test` and `pnpm typecheck` pass.

