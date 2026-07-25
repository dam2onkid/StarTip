Status: done

# Preserve FIFO ordering and terminal lifecycle outcomes

## What to build

Make the durable Creator-scoped Live Event sequence observable in the Live Event Client. Ordinary Donation Alerts and Donation Effects share one FIFO, only one effect is active at a time, and every event reaches a stable forward-only lifecycle outcome.

An event must start within 30 seconds of creation. Locally queued events that pass the deadline expire, and events with no client acknowledgement by the deadline become missed. Effect failures advance the queue and are never retried automatically.

## Acceptance criteria

- [x] Ordinary Donation Alerts and Donation Effects are consumed in ascending Creator sequence without overlapping effects.
- [x] The observable client queue allows only one active Donation Effect at a time.
- [x] Lifecycle follows `queued -> started -> completed | failed | stopped`, with `queued -> missed` and `queued -> expired` as terminal alternatives.
- [x] Completed, failed, stopped, missed, and expired states are terminal.
- [x] Lifecycle acknowledgements are idempotent, forward-only, and reject backward or conflicting transitions.
- [x] Rendering never waits for an acknowledgement response.
- [x] The event deadline is fixed at 30 seconds after creation and applies to starting, not finishing, an event.
- [x] An event received into the local queue but held beyond its deadline becomes expired and does not render.
- [x] A persisted event with no client acknowledgement by its deadline becomes missed.
- [x] A failed effect moves to failed, does not retry automatically, and allows the next eligible event to proceed.
- [x] Unique sequencing and concurrent creation remain safe under database integration tests.
- [x] Shared FIFO tests use externally observable states and deterministic clocks to cover ordering, deadlines, terminal transitions, and failure advancement.

## Blocked by

- Deliver verified Donation Effects end to end

## Comments

