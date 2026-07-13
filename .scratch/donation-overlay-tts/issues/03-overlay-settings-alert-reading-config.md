# 03 - Overlay settings: Alert Reading configuration

Status: ready-for-agent
Role: fullstack

## Parent

.scratch/donation-overlay-tts/PRD.md

## What to build

A Creator can turn Alert Reading on or off and pick which Voice reads their
Donation Alerts, from the dashboard's Overlay Settings card. The Voice list
shown always reflects what the Worker's Text-to-Speech Provider actually
supports.

## Acceptance criteria

- [ ] `overlay_settings` gains `tts_enabled boolean not null default false`
      and `tts_voice text` (nullable).
- [ ] `GET /api/overlay-settings` includes `tts_enabled`/`tts_voice` in its
      response (with the same defaults-when-no-row behavior as the existing
      columns).
- [ ] `PUT /api/overlay-settings` accepts and validates `tts_enabled`
      (boolean) and `tts_voice` (string or null, must be a Voice known to the
      Worker's current Voice list or null), and persists them the same way
      the existing fields are persisted (owner-only write via RLS).
- [ ] A new Next.js proxy route (e.g. `GET /api/tts/voices`) forwards to the
      Worker's voices endpoint, attaching the Worker secret server-side, and
      is used to populate the dashboard's Voice picker.
- [ ] The Overlay Settings card gains an Alert Reading on/off toggle and a
      Voice dropdown populated from the proxy route; saving persists both
      fields via the existing PUT flow.
- [ ] `lib/overlay/settings.ts`'s pure resolver is extended to surface
      `tts_enabled`/`tts_voice` in the client-facing settings shape, with
      tests added to `settings.test.ts` mirroring the existing coverage
      style for the other fields.
- [ ] Turning Alert Reading on with no Voice selected does not error (it is
      documented/treated as "Alert Reading unconfigured", not a failure
      state) — this ticket only covers persisting/surfacing the settings,
      not yet playing anything on the Overlay.

## Blocked by

- Worker Text-to-Speech endpoints
