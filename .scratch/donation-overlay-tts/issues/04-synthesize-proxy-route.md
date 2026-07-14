# 04 - Synthesize proxy route with per-Overlay-ID scoping

Status: done
Role: backend

## Parent

.scratch/donation-overlay-tts/PRD.md

## What to build

The Overlay (which has no session) can request a synthesized Alert Reading
without ever holding the Worker's secret, and that ability is scoped to a
single Overlay ID so it cannot be used to run up arbitrary Text-to-Speech
usage against a Creator's configuration.

## Acceptance criteria

- [ ] A new public Next.js route (e.g. `POST /api/tts`) accepts a request
      identifying the Overlay (by `overlay_id`) and the reading text/Voice,
      resolves the caller's `overlay_id` to a Creator the same way the
      Overlay page does (registered + not paused), attaches the Worker
      secret server-side, and forwards to the Worker's synthesize endpoint.
- [ ] The route returns the synthesized audio bytes on success, and passes
      through the Worker's error/timeout responses unchanged on failure.
- [ ] The route is rate-limited per `overlay_id` (exact limit left to the
      implementer, but must prevent unbounded synthesis calls from a single
      Overlay in a short window) and returns a clear error once the limit is
      hit.
- [ ] An unknown/invalid `overlay_id` is rejected before any call reaches the
      Worker.
- [ ] Unit tests mirror `apps/web/src/app/api/overlay-settings/route.test.ts`:
      mock `global.fetch` to the Worker and assert the proxy forwards the
      right payload/auth header, passes through success/error responses, and
      enforces the per-`overlay_id` rate limit.

## Blocked by

- Overlay ID replaces Handle
- Worker Text-to-Speech endpoints
