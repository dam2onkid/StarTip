-- Provide a stable way for the Worker to reserve a Live Event sequence before
-- building the complete envelope, so the row can be inserted with its full
-- payload in a single statement and Realtime publishes a usable event.

create or replace function public.next_live_event_sequence()
returns bigint
language sql
as $$
  select nextval('public.live_events_sequence_seq');
$$;

-- The service role (Worker) is the only caller that needs to reserve sequences.
grant execute on function public.next_live_event_sequence() to service_role;
