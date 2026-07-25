-- live_event_settings and effect_intents tables with RLS.
--
-- live_event_settings stores the Creator's explicit Live Events opt-in and
-- per-effect Default Pack prices. Prices are stored as display-amount numeric
-- values (test USDC) with a shared 0.10 platform floor enforced by a CHECK
-- constraint. Default prices are 1 for Screen Flash, 2 for Jump Scare, 3 for
-- Tunnel Vision, and 5 for Screen Cover.
--
-- effect_intents holds single-use, expiring off-chain records that bind a
-- Donor's selected effect to a Creator, token, raw minimum amount, pack
-- version, and donation preparation identity. It is written by the Worker
-- (service role) and is not directly readable or writable by clients.

-- Creator opt-in and per-effect pricing.

create table if not exists public.live_event_settings (
  id                    uuid primary key default gen_random_uuid(),
  creator_profile_id    uuid not null references public.profiles(id) on delete cascade,
  live_events_enabled   boolean not null default false,
  screen_flash_price    numeric not null default 1 check (screen_flash_price >= 0.10),
  jump_scare_price      numeric not null default 2 check (jump_scare_price >= 0.10),
  tunnel_vision_price   numeric not null default 3 check (tunnel_vision_price >= 0.10),
  screen_cover_price    numeric not null default 5 check (screen_cover_price >= 0.10),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One row per Creator: the dashboard upserts on save.
create unique index if not exists live_event_settings_creator_profile_id_key
  on public.live_event_settings (creator_profile_id);

-- Single-use Effect Intent records, written by the Worker.

create table if not exists public.effect_intents (
  id                  uuid primary key default gen_random_uuid(),
  creator_profile_id  uuid not null references public.profiles(id) on delete cascade,
  token               text not null,
  raw_amount          numeric not null check (raw_amount > 0),
  pack_id             text not null,
  pack_version        text not null,
  effect_id           text not null,
  donation_prep_id    text not null,
  status              text not null default 'pending',
  expires_at          timestamptz not null,
  created_at          timestamptz not null default now()
);

-- Look up an intent by the donation preparation identity for idempotency and
-- settlement matching.
create unique index if not exists effect_intents_donation_prep_id_key
  on public.effect_intents (donation_prep_id);

-- Row Level Security.

alter table public.live_event_settings enable row level security;
alter table public.effect_intents enable row level security;

-- Public read: the public Donation flow reads configuration through the
-- Next.js API (service role), but a public select policy lets the API use
-- a non-service client if needed. The API only returns public fields.
drop policy if exists "live_event_settings_public_select" on public.live_event_settings;
create policy "live_event_settings_public_select"
  on public.live_event_settings
  for select to anon, authenticated
  using (true);

-- Owner INSERT: a Creator can create their own row (the upsert on first save).
drop policy if exists "live_event_settings_owner_insert" on public.live_event_settings;
create policy "live_event_settings_owner_insert"
  on public.live_event_settings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = live_event_settings.creator_profile_id
        and p.user_id = auth.uid()
    )
  );

-- Owner UPDATE: only the Creator that owns the row may mutate it. WITH CHECK
-- keeps the row bound to the same owner.
drop policy if exists "live_event_settings_owner_update" on public.live_event_settings;
create policy "live_event_settings_owner_update"
  on public.live_event_settings
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = live_event_settings.creator_profile_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = live_event_settings.creator_profile_id
        and p.user_id = auth.uid()
    )
  );

-- No client DELETE policy for live_event_settings; service role handles cleanup.
-- No client policies for effect_intents; the Worker writes with the service role.

-- Column-level grants. Public SELECT is allowed because the API filters fields.
-- Authenticated owners get INSERT/UPDATE on the opt-in and price columns.
revoke all on public.live_event_settings from anon, authenticated;
grant select on public.live_event_settings to anon, authenticated;
grant insert (creator_profile_id, live_events_enabled, screen_flash_price, jump_scare_price, tunnel_vision_price, screen_cover_price)
  on public.live_event_settings to authenticated;
grant update (live_events_enabled, screen_flash_price, jump_scare_price, tunnel_vision_price, screen_cover_price)
  on public.live_event_settings to authenticated;

-- updated_at touch on every UPDATE so the dashboard can show "last saved".
create or replace function public.touch_live_event_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists live_event_settings_set_updated_at on public.live_event_settings;
create trigger live_event_settings_set_updated_at
  before update on public.live_event_settings
  for each row execute procedure public.touch_live_event_settings_updated_at();
