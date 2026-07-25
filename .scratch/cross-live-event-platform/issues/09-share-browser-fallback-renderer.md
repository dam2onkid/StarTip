Status: done

# Move the browser fallback onto the shared Donation Alert renderer

## What to build

Keep the browser Overlay as a reliable fallback while making it consume the same maintained Donation Alert renderer as the Live Event Client. The browser fallback retains existing ordinary Donation behavior and may represent an effect Donation as a normal Donation Alert because it is not a concurrent synchronized effect renderer.

## Acceptance criteria

- [x] The browser Overlay and Live Event Client consume the shared Donation Alert components and display contracts.
- [x] Existing browser Overlay alert duration, minimum amount, sound, Text-to-Speech, Voice, queueing, and moderation behavior remains intact.
- [x] Ordinary Donations remain visually and behaviorally consistent across the browser fallback and Live Event Client.
- [x] The browser Overlay does not download or execute desktop Effect Pack code.
- [x] An effect Donation may degrade to a normal browser Donation Alert when the fallback is used.
- [x] The supported flow does not require the browser Overlay and Tauri Game Overlay to render the same effect concurrently.
- [x] Existing Realtime-stub and Playwright coverage is updated to protect the shared behavior without replacing the real primary acceptance flow.
- [x] Pixel-focused browser verification confirms the shared renderer migration introduces no visible regression.

## Blocked by

- Render the signed Default Pack through shared components
- Deliver ordinary Donations to the Live Event Client

## Comments

Done in commit 607a1d7.
- `apps/web/src/app/(public)/overlay/[overlay_id]/overlay-alerts.tsx` now renders donation alerts through `@startip/shared/overlay/renderer` `planRender` and the `DonationAlertPlan` display contract.
- Effect donations are explicitly degraded to normal Donation Alerts (`effect: null`) so the browser fallback never downloads or executes Effect Pack code.
- Added `apps/web/src/app/(public)/overlay/[overlay_id]/overlay-alerts-renderer.test.tsx` to unit-test the shared renderer seam and effect fallback.
- Updated `apps/web/tests/overlay.spec.ts` Playwright coverage with an effect-donation fallback test.
- `pnpm typecheck` and `pnpm test` pass; `apps/web/tests/overlay.spec.ts` Playwright suite passes.
