Status: done

# Deliver ordinary Donations to the Live Event Client

## What to build

Turn every Worker-verified ordinary Donation into exactly one durable Creator-scoped Live Event, publish it through Supabase Realtime, and render it immediately in the Live Event Client as the existing Donation Alert.

The alert honors the Creator's alert duration, minimum amount, sound, Text-to-Speech, and Voice settings. Worker Text-to-Speech is requested in parallel so synthesis never delays the visual acknowledgement. Lifecycle writes use Overlay ID scope, remain best-effort, and never block rendering.

## Acceptance criteria

- [ ] Every verified Donation without an effect creates exactly one durable Live Event with a unique Creator sequence before Realtime publication.
- [ ] The Live Event envelope contains the event, Donation, Creator, Donor Name, raw amount, token display metadata, creation time, expiry time, and a null effect.
- [ ] Persistence and publication remain idempotent if settlement verification is retried.
- [ ] The Live Event table is added to Supabase Realtime using the repository's idempotent publication migration pattern.
- [ ] Overlay ID scoping prevents one Creator's client from reading or acknowledging another Creator's events.
- [ ] The Live Event Client renders the Donation Alert immediately on live delivery.
- [ ] Alert duration, minimum amount, sound, Text-to-Speech, and Voice behavior match the browser Overlay contract.
- [ ] Worker Text-to-Speech constructs its reading from the verified Donation and stored Voice rather than accepting arbitrary client text.
- [ ] A failed synthesis or the fixed three-second Tauri wait timeout silently omits Alert Reading without hiding or failing the Donation Alert.
- [ ] An Alert Reading that begins within the timeout may extend visibility beyond the configured alert duration.
- [ ] Audio uses the macOS default output and requires no bundled virtual audio device.
- [ ] The client sends best-effort started and terminal acknowledgements without waiting for their responses before rendering.
- [ ] Public HTTP, database integration, shared schema, renderer, and Live Event Client tests prove the complete ordinary-Donation behavior.

## Blocked by

- Launch a pointer-pass-through Game Overlay on the selected display

## Comments

