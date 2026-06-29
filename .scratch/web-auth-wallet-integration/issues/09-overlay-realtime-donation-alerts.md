Status: ready-for-agent

## Parent

`.scratch/web-auth-wallet-integration/PRD.md`

## What to build

The Overlay vertical slice: `/overlay/[handle]` is a public OBS browser source
that subscribes to Supabase Realtime on the `donations` table and renders
donation alerts (Donor Name, amount + token symbol, message) with animation as
new confirmed/indexed donations arrive. Only donations with
`moderation_status = visible` appear, so hidden messages are suppressed.

`/overlay/[handle]` uses `lib/supabase/client.ts` (`createBrowserClient` with
the anon key) to subscribe to Supabase Realtime on `donations` filtered by
`creator_profile_id` (the Creator behind the Handle) and
`status IN ('confirmed','indexed') AND moderation_status = 'visible'`. The
route resolves the Handle to the `creator_profile_id` via the public read path
(registered + not paused).

Renders each new donation as an alert: Donor Name, amount rendered with the
token symbol (joined from `tokens`), and the message, with animation. The
Overlay is designed to be added to OBS as a browser source.

Overlay theme configuration (colors, alert duration, sound) and the
`overlay_settings` table are out of scope for this PRD; the Overlay renders
donations with a sensible default presentation.

Tests: Playwright E2E for the Overlay (seed a confirmed + visible donation,
assert the alert renders with Donor Name, amount + symbol, and message; seed a
hidden donation and assert it does not appear; assert a Realtime-inserted
donation appears without a page reload).

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [ ] `/overlay/[handle]` is a public route that resolves the Handle to its
      `creator_profile_id` (registered + not paused).
- [ ] The Overlay subscribes to Supabase Realtime on `donations` filtered by
      `creator_profile_id` and `status IN ('confirmed','indexed')` and
      `moderation_status = 'visible'`.
- [ ] Each alert renders Donor Name, amount + token symbol (from `tokens`), and
      message with animation.
- [ ] Hidden donations (`moderation_status = 'hidden'`) do not appear.
- [ ] A donation inserted via Realtime appears without a page reload.
- [ ] Playwright covers the Overlay alert render, hidden suppression, and
      Realtime insertion.
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.

## Blocked by

- `.scratch/web-auth-wallet-integration/issues/05-donate-flow-prepare-confirm-onchain.md`
- `.scratch/web-auth-wallet-integration/issues/08-dashboard-creator-tab-active-features.md`
