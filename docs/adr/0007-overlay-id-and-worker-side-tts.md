# Overlay addressed by Overlay ID; Text-to-Speech synthesized in the Worker

The Overlay was addressed by Handle (`/overlay/[handle]`), the same public
identifier used for `/donate/[handle]`. Adding Text-to-Speech alert reading
was the trigger to fix a pre-existing gap: anyone who knows a Creator's
Handle can already open their live Overlay, which was never the intent (the
Overlay is a private OBS browser source, not a public page). We introduce a
separate, regenerable Overlay ID (opaque token, distinct from Handle) as the
Overlay's address, so knowing a Creator's Handle no longer grants access to
their live Overlay.

We considered pushing Donation events to the Overlay over a dedicated
WebSocket from the Worker (keyed by Overlay ID) instead of the existing
Supabase Realtime subscription. Rejected: the current Realtime channel is
already keyed by the internal `creator_profile_id`, not Handle, so it does
not leak Handle -> Overlay mapping; adding a second transport would not
improve privacy and would add reconnect/scaling complexity for no benefit.
The Overlay keeps subscribing to Supabase Realtime after resolving Overlay ID
-> `creator_profile_id` server-side; Text-to-Speech audio is fetched via a
plain HTTP request per Donation, proxied through the Next.js app to the
Worker (which is not itself public).

Text-to-Speech synthesis (edge-tts today, pluggable Provider interface for
future providers) lives in `apps/worker`, not `packages/shared`, since only
the Worker consumes it; promote it to shared only if a second consumer
appears.
