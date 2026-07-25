# Make the Live Event Queue durable

The server persists each validated Live Event in a Creator-scoped FIFO queue before publishing a Supabase Realtime notification. Persistence provides ordering, audit, and idempotent lifecycle acknowledgements, but the experience remains live-only: an event missed while the Live Event Client is offline is recorded as missed and never replayed after reconnect.
