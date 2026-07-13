# 01 - Overlay ID replaces Handle

Status: ready-for-agent
Role: fullstack

## Parent

.scratch/donation-overlay-tts/PRD.md

## What to build

The Overlay stops being addressed by the Creator's public Handle and is
instead addressed by a new, opaque Overlay ID that only the Creator knows.
Anyone who knows a Creator's Handle can no longer open their live Overlay.
The Creator's dashboard shows the new Overlay URL and can regenerate it,
immediately invalidating the previous one.

## Acceptance criteria

- [ ] A new `overlay_id` is generated automatically for a Creator once
      onboarding completes (mirrors how Handle is claimed today).
- [ ] `/overlay/[handle]` becomes `/overlay/[overlay_id]`; the Overlay server
      component resolves the token to the Creator's `creator_profile_id`
      (still gated on registered + not paused), not to Handle.
- [ ] `GET /api/overlay-settings` resolves by `overlay_id` instead of
      `handle`. The authed `PUT` is unchanged (already scoped by the
      caller's own profile).
- [ ] `/overlay/[handle]` no longer resolves a live Overlay (old Handle-based
      URLs 404 or otherwise stop working).
- [ ] The dashboard's Overlay URL card displays the `/overlay/[overlay_id]`
      URL instead of the Handle-based one.
- [ ] The dashboard has a "Regenerate" action that issues a new `overlay_id`
      for the caller's own profile; the previous Overlay URL stops resolving
      immediately after regeneration.
- [ ] The Overlay's Supabase Realtime subscription is unchanged (it already
      keys off `creator_profile_id`, not Handle or Overlay ID).
- [ ] `/donate/[handle]` and all other Handle-addressed surfaces are
      unaffected.
- [ ] CONTEXT.md's existing "Overlay ID" and "Overlay" glossary entries are
      matched by the shipped behavior.

## Blocked by

- None — can start immediately.
