-- Durable Live Events table for the Live Event Platform.
--
-- Every Worker-verified ordinary Donation creates one Live Event with a unique
-- server sequence before Supabase Realtime publication. The table carries a
-- denormalized overlay_id so the Live Event Client can subscribe and send
-- lifecycle acknowledgements scoped to one Creator.
--
-- Effect Donations are handled by a later migration/path; this table stores
-- an optional effect object inside the JSONB payload.

-- Global sequence used for the server-ordered event sequence.
create sequence if not exists public.live_events_sequence_seq;

create table if not exists public.live_events (
  id                  uuid primary key default gen_random_uuid(),
  creator_profile_id  uuid not null references public.profiles(id) on delete cascade,
  overlay_id          text not null,
  donation_id         uuid not null references public.donations(id) on delete cascade,
  sequence            bigint not null default nextval('live_events_sequence_seq'),
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'queued',
  expires_at          timestamptz not null,
  terminal_reason     text,
  ack_started_at      timestamptz,
  ack_terminal_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One Live Event per donation (idempotency on settlement verification retries).
create unique index if not exists live_events_donation_id_key
  on public.live_events (donation_id);

-- Realtime filtering and ack endpoint lookups by overlay_id.
create index if not exists live_events_overlay_id_idx
  on public.live_events (overlay_id);

-- Row Level Security.

alter table public.live_events enable row level security;

-- Anon reads are scoped by the Realtime channel filter on overlay_id. This
-- policy exposes only queued events so historical/terminal rows are not
-- broadcast. The unguessable overlay_id is the effective access boundary.
drop policy if exists "live_events_anon_select" on public.live_events;
create policy "live_events_anon_select"
  on public.live_events
  for select to anon
  using (status = 'queued');

-- No direct client INSERT/UPDATE/DELETE. The Worker service role creates the
-- event and processes lifecycle acknowledgements.
revoke all on public.live_events from anon, authenticated;
grant select (id, creator_profile_id, overlay_id, donation_id, sequence, payload, status, expires_at, created_at)
  on public.live_events to anon;

-- updated_at touch on every UPDATE so lifecycle transitions carry a fresh timestamp.
create or replace function public.touch_live_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists live_events_set_updated_at on public.live_events;
create trigger live_events_set_updated_at
  before update on public.live_events
  for each row execute procedure public.touch_live_events_updated_at();

-- Add live_events to the Supabase Realtime publication idempotently.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_events'
  ) then
    alter publication supabase_realtime add table public.live_events;
  end if;
end
$$;
