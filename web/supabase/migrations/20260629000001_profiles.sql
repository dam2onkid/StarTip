-- profiles table and RLS.
--
-- The off-chain row representing a User. Created automatically on first
-- Supabase login by a trigger on auth.users. Carries shared identity fields
-- (display_name, avatar_url, bio) plus Creator fields (handle, handle_hash,
-- owner_address, payout_address, onchain_registered, paused, wallet link
-- nonce) that stay NULL until the User becomes a Creator.
--
-- RLS:
--   * Owner (auth.uid() = profiles.user_id) can SELECT all columns of their
--     row and UPDATE only display_name, avatar_url, bio, wallet_link_nonce,
--     wallet_link_nonce_expires_at (enforced by column-level GRANT).
--   * Public read of public fields (handle, display_name, avatar_url, bio,
--     onchain_registered) for rows where onchain_registered = true AND
--     paused = false is exposed via the public_profiles view. The base table
--     has no public SELECT policy, so anon/authenticated cannot read
--     owner_address, payout_address, user_id, or nonces.
--   * INSERT/DELETE denied to clients (no policy = denied); service role only.

create table if not exists public.profiles (
  id                              uuid primary key default gen_random_uuid(),
  user_id                         uuid not null references auth.users(id) on delete cascade,
  display_name                    text not null default 'Anonymous',
  avatar_url                      text,
  bio                             text,
  handle                          text unique,
  handle_hash                     bytea,
  owner_address                   text,
  wallet_link_nonce               text,
  wallet_link_nonce_expires_at    timestamptz,
  payout_address                  text,
  onchain_registered              boolean not null default false,
  paused                          boolean not null default false,
  created_at                      timestamptz not null default now(),
  onchain_registered_at           timestamptz
);

create unique index if not exists profiles_user_id_key on public.profiles (user_id);

-- Autocreate a profiles row on auth.users INSERT with display_name =
-- 'Anonymous' and all Creator fields NULL.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Row Level Security.

alter table public.profiles enable row level security;

-- Owner can SELECT all columns of their own row.
drop policy if exists "profiles_owner_select" on public.profiles;
create policy "profiles_owner_select"
  on public.profiles
  for select to authenticated
  using (auth.uid() = user_id);

-- Owner can UPDATE only the identity + nonce fields. Column-level GRANT
-- (below) restricts which columns are writable; this policy restricts which
-- rows. WITH CHECK keeps the row bound to the same user.
drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update"
  on public.profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No INSERT or DELETE policies: clients cannot insert or delete profiles.
-- The autocreate trigger (security definer) and the service role bypass RLS.

-- Column-level grants. SELECT: owner gets all columns via the policy above;
-- anon gets none on the base table (public read goes through public_profiles).
-- UPDATE: only the identity + nonce fields are writable by the owner.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, bio, wallet_link_nonce, wallet_link_nonce_expires_at)
  on public.profiles to authenticated;

-- public_profiles: public read of public fields for active, registered
-- creators only. Exposes handle, display_name, avatar_url, bio,
-- onchain_registered. All other columns (owner_address, payout_address,
-- user_id, nonces, handle_hash) are excluded. Runs as the table owner
-- (security definer, the Postgres default for views) so it bypasses the
-- base table's RLS and is readable by anon.
create or replace view public.public_profiles as
  select
    handle,
    display_name,
    avatar_url,
    bio,
    onchain_registered
  from public.profiles
  where onchain_registered = true and paused = false;

grant select on public.public_profiles to anon, authenticated;
