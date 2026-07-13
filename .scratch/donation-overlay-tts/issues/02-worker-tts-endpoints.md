# 02 - Worker Text-to-Speech endpoints

Status: done
Role: backend

## Parent

.scratch/donation-overlay-tts/PRD.md

## What to build

The Worker gains the ability to synthesize speech from text and to list the
Voices available for that speech, behind a pluggable Text-to-Speech Provider
interface (edge-tts is the only Provider implemented now). These endpoints
are internal to the Worker (bearer-secret auth, not publicly reachable),
following the same shape as the existing `/verify` endpoint.

## Acceptance criteria

- [x] A `TtsProvider` interface is defined: synthesize(text, voice) -> audio
      bytes, and list the Voices a Provider supports (optionally filtered by
      locale).
- [x] An edge-tts-backed implementation of `TtsProvider` is wired up as the
      Worker's active Provider.
- [x] A Hono endpoint (e.g. `POST /tts`) accepts reading text + a Voice
      identifier, calls the active Provider, and returns synthesized audio
      bytes in a single response (no streaming).
- [x] The synthesize endpoint enforces an 8-second timeout; on timeout or any
      Provider error it returns an error response. There is no retry.
- [x] A Hono endpoint (e.g. `GET /tts/voices`) returns the active Provider's
      Voice list.
- [x] Both endpoints require the same bearer `WORKER_SECRET` auth as
      `/verify` and reject requests without it (401).
- [x] Unit tests mirror `apps/worker/src/server.test.ts`: a
      `createTtsApp(deps, options, secret)`-style factory takes an injected
      `TtsProvider` (mocked, never a real edge-tts network call) and tests
      exercise auth (401), invalid body (400), the timeout/provider-error
      path (no retry), and the happy-path synthesize + voices responses via
      `app.request(...)`.
- [x] No caching of synthesized audio (each Donation's reading text is
      unique; nothing to cache).

## Blocked by

- None — can start immediately.
