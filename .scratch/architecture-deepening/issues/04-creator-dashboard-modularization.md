Status: completed

## Parent

`/private/var/folders/tk/rmcx56cx2gz8r5jfsgdrnn5m0000gn/T/architecture-review-20260712-142520.html` (StarTip architecture review)

# Extract the creator dashboard into focused modules

## What to build

Split the onboarding gates (profile pending, wallet pending, on-chain pending)
and the active settings panel (payout, pause, overlay, goal, and moderation)
out of the creator dashboard into standalone modules. Each module exposes a
narrow interface. The `CreatorTab` becomes a thin orchestrator that routes by the
onboarding state machine.

## Acceptance criteria

- [ ] The onboarding gates are separate modules that can be rendered in
      isolation.
- [ ] The active settings cards and moderation list are separate modules with
      narrow interfaces.
- [ ] The `CreatorTab` orchestrator is small and routes by the onboarding state.
- [ ] The dashboard is fully functional: claim handle, link wallet, register
      on-chain, update payout, pause/unpause, manage overlay settings, and
      moderate donations all still work.
- [ ] Each extracted module can be tested through its own interface.

## Blocked by

- None — can start immediately.
