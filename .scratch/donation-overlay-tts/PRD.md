# Donation Overlay Text-to-Speech

Status: done

## Problem Statement

Creators run the Overlay as an OBS browser source so viewers can see Donation
Alerts on stream, but the Creator themselves is often not looking at the
screen (they are talking to camera, playing a game, etc.) and can miss who
donated, how much, and what the message said unless they turn to read it.
Separately, the Overlay is currently addressed by the same Handle used on the
public `/donate/[handle]` page, so anyone who knows a Creator's Handle can
open their live Overlay in a browser — the Overlay was meant to be a private
OBS browser-source URL, not a guessable public one.

## Solution

Add an optional Alert Reading: when a Donation Alert appears on the Overlay,
it can be read aloud (Donor Name, amount, and message) in a Creator-chosen
Voice, using a pluggable Text-to-Speech Provider (edge-tts to start). At the
same time, close the Handle-based access gap by addressing the Overlay with
a separate, regenerable Overlay ID instead of the Handle.

## User Stories

1. As a Creator, I want each Donation Alert on my Overlay to be read aloud, so that I know who donated, how much, and what they said without having to look at the screen.
2. As a Creator, I want to turn Alert Reading on or off, so that I can disable it if I prefer a silent or sound-only Overlay.
3. As a Creator, I want to choose the Voice used for Alert Reading from a list of available Voices, so that the reading matches my stream's language and tone.
4. As a Creator, I want the Voice list to reflect what the configured Text-to-Speech Provider actually supports, so that I never pick a Voice that fails at read time.
5. As a Creator, I want the Overlay Alert to stay on screen until the Alert Reading finishes (when reading is on), so that viewers watching the stream see the alert for as long as it's being read.
6. As a Creator, I want a short alert sound to play before the Alert Reading starts (when both are enabled), so that the two audio cues don't overlap.
7. As a Creator, I want a failed or slow Alert Reading to never block or hide the Donation Alert itself, so that a Text-to-Speech outage never breaks my Overlay.
8. As a Creator, I want very long donation messages to be read only up to a reasonable length, so that one long message doesn't stall the reading of subsequent donations.
9. As a Creator, I want my Overlay to be reachable only via a private, unguessable URL instead of my public Handle, so that random viewers who know my Handle cannot open my live Overlay.
10. As a Creator, I want to regenerate my Overlay's URL from the dashboard, so that I can invalidate it immediately if it ever leaks (e.g. accidentally shown on stream).
11. As a Creator, when I regenerate my Overlay URL, I want my old OBS browser source to stop working immediately, so that a leaked URL cannot keep being used.
12. As a Creator, I want my Overlay settings (Alert Reading on/off, Voice, alert duration, minimum amount, sound) to keep working exactly as before after the URL change, so that switching to an Overlay ID doesn't reset my configuration.
13. As a viewer/Donor, I want the Donation Alert's visible text to always show my full message even when the spoken reading is truncated, so that the on-screen record of my donation is not shortened.
14. As a Creator, I want donations below my configured minimum amount to be silently recorded without an Alert Reading (same as they are without a visible Alert today), so that small donations don't trigger noise on stream.
15. As a Creator, I want the Text-to-Speech synthesis itself to happen server-side, so that my OBS browser source never needs direct network access to a third-party speech service or any embedded secret.
16. As a maintainer, I want the Text-to-Speech integration built behind a Provider interface, so that a future Provider (a paid API, a different engine) can be added without changing the Overlay or Worker HTTP contracts.

## Implementation Decisions

### Overlay ID

- Add an `overlay_id` column to `profiles`: an opaque, unguessable token distinct from Handle, generated once onboarding completes (mirrors how Handle is claimed).
- `/overlay/[handle]` route becomes `/overlay/[overlay_id]`. The Overlay server component resolves the token to `creator_profile_id` (registered + not paused, same gating as today) instead of resolving Handle.
- The public `GET /api/overlay-settings` endpoint (used by the Overlay page) resolves by `overlay_id` instead of `handle`. The authed `PUT` is unaffected — it already scopes by the caller's own `profile.id` via `requireAuthedCreator`.
- The Creator dashboard displays the `/overlay/[overlay_id]` URL (replacing the current Handle-based URL) and adds a "Regenerate" action that issues a new `overlay_id`, immediately invalidating the previous URL (old browser sources 404 on next load/reconnect).
- The Overlay's Supabase Realtime subscription is unaffected: it already subscribes by the internal `creator_profile_id`, not by Handle or Overlay ID, so no change to the Realtime channel/filter.
- No change to `/donate/[handle]`, on-chain identity, or any other Handle-addressed surface.

### Text-to-Speech Provider (Worker)

- New module in `apps/worker` defining a `TtsProvider` interface: synthesize text + a Voice identifier into audio bytes, and list the Voices a Provider supports (optionally filtered by locale).
- An `edge-tts`-backed implementation of `TtsProvider` is the only Provider shipped initially. Provider selection is owned entirely by the Worker; a Creator only ever picks a Voice, never a Provider.
- New Hono endpoint(s) on the Worker, following the existing `/verify` pattern (bearer-token `WORKER_SECRET` auth, not publicly reachable):
  - Synthesize endpoint: accepts the reading text and a Voice identifier, returns the synthesized audio bytes as a single response (no streaming, no caching — each Donation's text is unique so there's nothing worth caching).
  - Voices endpoint: returns the current Provider's Voice list.
  - Synthesis has an 8-second timeout. On timeout or any Provider error, the endpoint returns an error response; there is no retry.

### Next.js proxy

- New `apps/web` API routes proxy to the Worker the same way the existing verify proxy does: the Overlay (unauthenticated) calls a Next.js route, which attaches the Worker secret server-side and forwards to the Worker's synthesize/voices endpoints.
- The synthesize proxy route is public (the Overlay has no session) and must be scoped/rate-limited per Overlay ID so it cannot be used to run up arbitrary Text-to-Speech usage against a Creator's configuration.
- The voices proxy route is used by the authed dashboard to populate the Voice picker.

### Overlay settings schema

- Extend the `overlay_settings` table with `tts_enabled boolean not null default false` and `tts_voice text` (nullable; `null` means Alert Reading is effectively off even if `tts_enabled` is true, since there is nothing to synthesize with).
- The existing `min_amount` threshold is shared by both the visible Donation Alert and the Alert Reading — no separate TTS-only threshold.
- The existing `alert_duration_ms`, `sound_enabled`, and `theme` columns are unchanged.

### Reading text and template

- The Alert Reading text is built from Donor Name, display amount + token symbol, and message, using a sentence template selected by the chosen Voice's locale (e.g. an English-locale Voice reads an English template, a Vietnamese-locale Voice reads a Vietnamese template).
- The message portion of the reading text is capped to the first ~200 characters. This cap applies only to what is sent to the Text-to-Speech Provider — the Donation Alert's visible message is never truncated.

### Overlay playback behavior

- On a new Donation Alert: if `sound_enabled`, play the existing alert sound first; then, if `tts_enabled` and `tts_voice` is set, fetch and play the Alert Reading. The two never overlap.
- The Donation Alert's on-screen lifetime is `max(alert_duration_ms, alert reading duration)` when a reading is attempted — the alert does not disappear mid-sentence. When Alert Reading is off, unconfigured, or fails, the lifetime is just `alert_duration_ms` as today.
- A failed or timed-out Alert Reading is silent (no audio, no error UI) and never delays or hides the Donation Alert beyond the plain `alert_duration_ms` fallback.
- The `min_amount` filter that already suppresses low-value Donation Alerts also suppresses Alert Reading for the same donations (they're never shown, so nothing to read).

### Dashboard

- The Overlay Settings card gains a Alert Reading on/off toggle and a Voice picker (populated from the Worker's Voice list via the proxy route). The Overlay URL card switches to displaying the Overlay-ID-based URL and gains a Regenerate action.

## Testing Decisions

Tests should assert observable behavior at the boundary of each seam, not internal implementation details (matching this repo's existing style of testing HTTP contracts and rendered component output rather than internals).

- **Worker Text-to-Speech HTTP contract** (new, mirrors `apps/worker/src/server.ts` + `server.test.ts` for `/verify`): a `createTtsApp(deps, options, secret)`-style factory takes an injected `TtsProvider` (mocked in tests, never a real edge-tts call) so tests exercise auth (401), invalid body (400), the 8-second timeout/provider-error path (no retry), and the happy-path synthesize + voices responses, purely through `app.request(...)`.
- **Next.js proxy routes** (mirrors `apps/web/src/app/api/overlay-settings/route.test.ts`): mock `global.fetch` to the Worker and assert the proxy forwards the right payload/auth header and passes through success/error responses unchanged, plus the per-Overlay-ID scoping/rate-limit behavior.
- **Overlay client component** (extends `apps/web/src/app/(public)/overlay/[overlay_id]/overlay-alerts.test.tsx`, the renamed existing `overlay-alerts.test.tsx`): using the existing mocked `Audio` global and Realtime stub, add cases for sound-then-reading sequencing, the alert waiting for reading playback before dismissing, and reading failure/timeout not affecting the plain-duration dismissal.
- **Pure settings helpers** (extends `apps/web/src/lib/overlay/settings.ts` + `settings.test.ts`): add coverage for resolving `tts_enabled`/`tts_voice` into the client-facing settings shape and for the ~200-character message cap used to build reading text.
- **Overlay page resolution by Overlay ID**: follows the existing precedent that `apps/web/src/app/(public)/overlay/[handle]/page.tsx` (server component) has no dedicated unit test today; the renamed `[overlay_id]/page.tsx` keeps that precedent (covered indirectly by Playwright E2E if/when it exercises the Overlay route).

## Issues

- [01](issues/01-overlay-id-replaces-handle.md) - Overlay ID replaces Handle
- [02](issues/02-worker-tts-endpoints.md) - Worker Text-to-Speech endpoints
- [03](issues/03-overlay-settings-alert-reading-config.md) - Overlay
  settings: Alert Reading configuration
- [04](issues/04-synthesize-proxy-route.md) - Synthesize proxy route with
  per-Overlay-ID scoping
- [05](issues/05-overlay-alert-reading-playback.md) - Overlay Alert Reading
  playback

## Out of Scope

- A dedicated WebSocket transport from the Worker to the Overlay (rejected in ADR-0007 — the existing Supabase Realtime subscription, keyed by `creator_profile_id`, already doesn't leak Handle or Overlay ID and a second transport adds no privacy benefit).
- Caching or persisting synthesized audio (each Donation's reading text is unique; nothing to cache).
- Any additional Text-to-Speech Provider beyond edge-tts (the Provider interface must support adding one later, but none is implemented now).
- Retrying a failed/timed-out synthesis call.
- A separate minimum-amount threshold for Alert Reading distinct from the existing visible-alert threshold.
- Sanitizing/moderating the text sent to the Text-to-Speech Provider beyond what Moderation Status already filters (hidden donations never reach the Overlay at all).
- Any change to `/donate/[handle]`, on-chain identity, or Handle semantics elsewhere in the app.

## Further Notes

- See ADR-0007 for the rationale behind pairing the Overlay ID change with this feature, and for why Text-to-Speech synthesis lives in `apps/worker` rather than `packages/shared` (promote later only if a second consumer appears).
- `CONTEXT.md` has been updated with the new domain terms this feature introduces: Overlay ID, Donation Alert, Alert Reading, Voice, and Text-to-Speech Provider.
- The exact edge-tts Node package (e.g. `node-edge-tts` vs `@travisvn/edge-tts`) is an implementation detail left to the implementing agent; both were surveyed during design and either satisfies the `TtsProvider` interface.
