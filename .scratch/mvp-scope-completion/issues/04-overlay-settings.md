Status: ready-for-agent

## Parent

`.scratch/mvp-scope-completion/PRD.md`

## What to build

The overlay settings vertical slice. A Creator can configure how long each
alert stays on screen (`alert_duration_ms`), a minimum donation amount below
which alerts do not appear (`min_amount`), and whether a sound plays on
insert (`sound_enabled`). The Overlay applies these settings: alerts
auto-dismiss after the configured duration, donations below `min_amount` are
silently recorded but not shown, and a sound plays on Realtime insert when
enabled. Sensible defaults (6000ms, 0, true) apply out of the box.

Schema: a new `overlay_settings` table (spec §11.3) with `id`,
`creator_profile_id` (references `profiles(id)` on delete cascade),
`alert_duration_ms integer default 6000`, `min_amount numeric default 0`,
`sound_enabled boolean default true`, `theme text default 'default'`,
`created_at`, `updated_at`. RLS: public read; owner write
(`auth.uid() = profiles.user_id` join on `creator_profile_id`). One row per
Creator, created lazily via an upsert on first dashboard load or first
Overlay fetch.

A new pure library module holds the filter/timing logic:

- `lib/overlay/settings.ts`: `shouldShowAlert(donation, settings) -> boolean`
  (checks `amount >= min_amount` in raw units) and `alertDurationMs(settings)
  -> number` (defaults to 6000). Pure, client-safe.

API: `GET /api/overlay-settings?handle=<handle>` for public read (returns
defaults if no row); `PUT /api/overlay-settings` (authed) to upsert the
caller's row, validating `alert_duration_ms` (1000-60000), `min_amount` (>=
0), `sound_enabled` (boolean).

UI: the dashboard active Creator panel gets an Overlay Settings card
(duration, min amount, sound toggle). The Overlay server component loads the
Creator's settings row and passes it to the client, which applies
`shouldShowAlert` and `alertDurationMs`. Each `AlertCard` starts a timer on
mount and removes itself on expiry. A single short alert sound (bundled in
`/public`) plays on Realtime insert when `sound_enabled` is true (no sound on
initial server-rendered donations).

## Acceptance criteria

- [ ] The `overlay_settings` table migration exists with the specified
      columns and defaults.
- [ ] RLS allows public SELECT and owner UPDATE; non-owner UPDATE is denied.
- [ ] `shouldShowAlert` returns `false` for a donation below `min_amount`
      (in raw units) and `true` otherwise.
- [ ] `alertDurationMs` returns the configured value or the 6000 default.
- [ ] `GET /api/overlay-settings?handle=<handle>` returns the Creator's
      settings or defaults when no row exists.
- [ ] `PUT /api/overlay-settings` (authed owner) upserts the row; non-owner
      PUT is rejected.
- [ ] The dashboard active Creator panel has an Overlay Settings card that
      edits and saves `alert_duration_ms`, `min_amount`, `sound_enabled`.
- [ ] The Overlay auto-dismisses each alert after `alert_duration_ms`.
- [ ] The Overlay does not render donations below `min_amount`.
- [ ] The Overlay plays a sound on Realtime insert when `sound_enabled` is
      true, and no sound when false.
- [ ] `supabase/tests/overlay_settings_rls.test.sql` covers public SELECT,
      owner UPDATE, non-owner UPDATE denied.
- [ ] vitest covers `shouldShowAlert` and `alertDurationMs`.
- [ ] `overlay-alerts.test.tsx` is extended (fake timers) to assert
      auto-dismiss, min_amount suppression, and sound gating.
- [ ] `app/api/overlay-settings/route.test.ts` covers public GET, owner PUT,
      non-owner PUT 403.
- [ ] `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None - can start immediately
