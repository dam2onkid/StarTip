-- overlay_settings table and RLS.
--
-- Per-Creator Overlay configuration (spec §11.3). One row per Creator,
-- created lazily via an upsert on first dashboard load or first Overlay
-- fetch. The Overlay server component reads the row (or falls back to the
-- column defaults) and passes it to the client, which applies
-- `shouldShowAlert` (suppress donations below `min_amount`) and
-- `alertDurationMs` (auto-dismiss each alert after the configured duration),
-- and plays a short alert sound on Realtime insert when `sound_enabled` is
-- true.
--
-- `min_amount` is stored as a display-amount numeric (the same units the
-- Creator types in the dashboard card). The Overlay server component
-- converts it to raw units (multiplied by 10^decimals for the donation's
-- token) before handing it to the client, so the client compares raw
-- `amount` (i128) against raw `min_amount` without a per-alert decimals
-- lookup.
--
-- RLS:
--   * anon + authenticated: SELECT all columns (the public Overlay reads the
--     row without a session).
--   * Owner (auth.uid() = profiles.user_id join on creator_profile_id) can
--     INSERT and UPDATE their row. Non-owners cannot mutate.
--   * DELETE: denied to clients (no policy); service role only.

create table if not exists public.overlay_settings (
  id                  uuid primary key default gen_random_uuid(),
  creator_profile_id  uuid not null references public.profiles(id) on delete cascade,
  alert_duration_ms   integer not null default 6000,
  min_amount          numeric not null default 0,
  sound_enabled       boolean not null default true,
  theme               text not null default 'default',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One row per Creator: the dashboard upserts on first save and the Overlay
-- fetch falls back to defaults when no row exists.
create unique index if not exists overlay_settings_creator_profile_id_key
  on public.overlay_settings (creator_profile_id);

-- Row Level Security.

alter table public.overlay_settings enable row level security;

-- Public read: the Overlay is a public OBS browser source with no session.
drop policy if exists "overlay_settings_public_select" on public.overlay_settings;
create policy "overlay_settings_public_select"
  on public.overlay_settings
  for select to anon, authenticated
  using (true);

-- Owner INSERT: a Creator can create their own row (the upsert on first
-- dashboard save). The join on profiles.user_id binds the row to the caller.
drop policy if exists "overlay_settings_owner_insert" on public.overlay_settings;
create policy "overlay_settings_owner_insert"
  on public.overlay_settings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = overlay_settings.creator_profile_id
        and p.user_id = auth.uid()
    )
  );

-- Owner UPDATE: only the Creator that owns the row may mutate it. WITH CHECK
-- keeps the row bound to the same owner (creator_profile_id cannot be
-- repointed to another Creator's profile).
drop policy if exists "overlay_settings_owner_update" on public.overlay_settings;
create policy "overlay_settings_owner_update"
  on public.overlay_settings
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = overlay_settings.creator_profile_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = overlay_settings.creator_profile_id
        and p.user_id = auth.uid()
    )
  );

-- No DELETE policy: clients cannot delete overlay_settings. The service role
-- bypasses RLS; the ON DELETE CASCADE on creator_profile_id cleans up when a
-- profile is removed.

-- Column-level grants. anon + authenticated get SELECT (the Overlay is
-- public); authenticated get INSERT + UPDATE on all updatable columns.
revoke all on public.overlay_settings from anon, authenticated;
grant select on public.overlay_settings to anon, authenticated;
grant insert (creator_profile_id, alert_duration_ms, min_amount, sound_enabled, theme)
  on public.overlay_settings to authenticated;
grant update (alert_duration_ms, min_amount, sound_enabled, theme)
  on public.overlay_settings to authenticated;

-- updated_at touch on every UPDATE so the dashboard can show "last saved".
create or replace function public.touch_overlay_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists overlay_settings_set_updated_at on public.overlay_settings;
create trigger overlay_settings_set_updated_at
  before update on public.overlay_settings
  for each row execute procedure public.touch_overlay_settings_updated_at();
