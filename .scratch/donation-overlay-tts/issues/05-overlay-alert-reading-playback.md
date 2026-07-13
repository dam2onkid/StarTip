# 05 - Overlay Alert Reading playback

Status: ready-for-agent
Role: frontend

## Parent

.scratch/donation-overlay-tts/PRD.md

## What to build

When a Creator has Alert Reading enabled with a Voice chosen, each Donation
Alert on their live Overlay is actually read aloud: donor name, amount, and
message, in that Voice, after the existing alert sound (if enabled) finishes.
The Donation Alert stays on screen for as long as the reading takes, and any
Text-to-Speech failure never affects the alert's normal display.

## Acceptance criteria

- [ ] On a new Donation Alert, if `sound_enabled`, the existing alert sound
      plays first; if `tts_enabled` and `tts_voice` is set, the Overlay then
      fetches and plays the Alert Reading via the synthesize proxy route.
      The two audio cues never overlap.
- [ ] The reading text is built from Donor Name, display amount + token
      symbol, and message, using a sentence template selected by the chosen
      Voice's locale.
- [ ] The message portion of the reading text is capped to the first ~200
      characters before being sent for synthesis; the Donation Alert's
      visible message is never truncated.
- [ ] The Donation Alert's on-screen lifetime is
      `max(alert_duration_ms, reading duration)` when a reading is
      attempted; when Alert Reading is off, unconfigured, or fails, the
      lifetime is the existing `alert_duration_ms` only.
- [ ] A failed or timed-out Alert Reading is silent (no audio, no error UI)
      and never delays or hides the Donation Alert beyond the plain
      `alert_duration_ms` fallback.
- [ ] Donations already suppressed by the existing `min_amount` filter are
      also not read (they are never shown, so there is nothing to read).
- [ ] Tests extend `overlay-alerts.test.tsx` (using the existing mocked
      `Audio` global and Realtime stub) to cover: sound-then-reading
      sequencing, the alert waiting for reading playback before dismissing,
      and reading failure/timeout falling back to plain-duration dismissal.

## Blocked by

- Overlay settings: Alert Reading configuration
- Synthesize proxy route with per-Overlay-ID scoping
