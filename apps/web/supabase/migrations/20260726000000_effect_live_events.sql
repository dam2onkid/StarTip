-- Effect Live Event delivery schema additions.
--
-- Links durable Live Events to the Effect Intent they consume, adds suppression
-- tracking to effect_intents, and constrains the intent lifecycle statuses so
-- a single intent cannot produce more than one Donation Effect Live Event.

-- Effect Intent lifecycle tracking.
alter table public.effect_intents
  add column if not exists suppression_reason text,
  add column if not exists donation_id uuid references public.donations(id) on delete set null;

-- Constrain effect_intents.status to the known lifecycle values.
alter table public.effect_intents
  drop constraint if exists effect_intents_status_check;
alter table public.effect_intents
  add constraint effect_intents_status_check
  check (status in ('pending', 'consumed', 'suppressed'));

-- Link Live Events to the Effect Intent they consumed for idempotency/audit.
alter table public.live_events
  add column if not exists effect_intent_id uuid references public.effect_intents(id) on delete set null;

-- One Live Event per Effect Intent (the Effect Intent identity is the
-- idempotency key for effect donations).
create unique index if not exists live_events_effect_intent_id_key
  on public.live_events (effect_intent_id)
  where effect_intent_id is not null;

-- Index for the worker to look up whether a donation already has a Live Event.
create index if not exists live_events_donation_id_idx
  on public.live_events (donation_id);
