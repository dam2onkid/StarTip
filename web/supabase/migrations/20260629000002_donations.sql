-- donations table and RLS.
--
-- Mirrors on-chain DonationRouter donation events. Rows are created by the
-- prepare endpoint (status = 'pending'), promoted to 'confirmed' by the
-- confirm path, and to 'indexed' by the indexer. Both the confirm and indexer
-- paths upsert by tx_hash so concurrent writes converge.
--
-- `donation_id = id` (one column). `donation_id_hash` is sha256(id::text),
-- used by the indexer to match an on-chain DonationReceived event to the
-- pending row. `handle_hash` is denormalized (bytea) so the indexer can match
-- events without a join. `amount` is numeric (not bigint) to hold
-- arbitrary-precision i128.
--
-- bytea wire convention: handle_hash and donation_id_hash travel over the
-- PostgREST API as hex strings with the `\x` prefix (e.g. `\xdeadbeef...`),
-- which is how Postgres casts text to bytea and how PostgREST encodes bytea
-- in JSON responses. Clients and route handlers must use this format.
--
-- RLS:
--   * anon: SELECT only the public columns of rows where
--     status IN ('confirmed','indexed') AND moderation_status = 'visible'.
--     Enables the public overlay Realtime subscription and explore pages.
--   * authenticated: SELECT all columns of rows where the caller is the
--     creator (via join on creator_profile_id) OR the donor (user_id). Public
--     columns of visible confirmed/indexed rows are read via the
--     public_donations view, so authenticated non-creator non-donor users do
--     not see donor_address, user_id, tx_hash, etc.
--   * INSERT/DELETE: denied to clients (no policy); service role only.
--   * UPDATE: only the creator (via join) may UPDATE moderation_status
--     (column-level GRANT restricts to that column).

create table if not exists public.donations (
  id                  uuid primary key default gen_random_uuid(),
  donation_id_hash    bytea not null,
  tx_hash             text unique,
  creator_profile_id  uuid not null references public.profiles(id) on delete cascade,
  handle_hash         bytea not null,
  token               text not null,
  amount              numeric not null,
  message             text,
  donor_name          text not null default 'Anonymous',
  donor_address       text,
  user_id             uuid references auth.users(id) on delete set null,
  status              text not null default 'pending',
  moderation_status   text not null default 'visible',
  created_at          timestamptz not null default now(),
  confirmed_at        timestamptz,
  indexed_at          timestamptz
);

create index if not exists donations_donation_id_hash_idx
  on public.donations (donation_id_hash);
create index if not exists donations_creator_profile_id_idx
  on public.donations (creator_profile_id);
create index if not exists donations_handle_hash_idx
  on public.donations (handle_hash);

-- Row Level Security.

alter table public.donations enable row level security;

-- anon: visible confirmed/indexed donations only. Column-level GRANT below
-- restricts anon to the public columns.
drop policy if exists "donations_anon_visible_select" on public.donations;
create policy "donations_anon_visible_select"
  on public.donations
  for select to anon
  using (status in ('confirmed', 'indexed') and moderation_status = 'visible');

-- authenticated creator: all columns of donations they received.
drop policy if exists "donations_creator_select" on public.donations;
create policy "donations_creator_select"
  on public.donations
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = donations.creator_profile_id
        and p.user_id = auth.uid()
    )
  );

-- authenticated donor: all columns of their own donations.
drop policy if exists "donations_donor_select" on public.donations;
create policy "donations_donor_select"
  on public.donations
  for select to authenticated
  using (donations.user_id = auth.uid());

-- authenticated creator: UPDATE moderation_status only. Column-level GRANT
-- restricts the writable column; this policy restricts the writable rows.
drop policy if exists "donations_creator_moderation_update" on public.donations;
create policy "donations_creator_moderation_update"
  on public.donations
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = donations.creator_profile_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = donations.creator_profile_id
        and p.user_id = auth.uid()
    )
  );

-- No INSERT or DELETE policies: clients cannot insert or delete donations.
-- The service role (indexer, prepare, confirm) bypasses RLS.

-- Column-level grants.
--   * anon: public columns only, on rows visible via the policy above.
--   * authenticated: all columns, on rows visible via creator/donor policies.
revoke all on public.donations from anon, authenticated;
grant select
  (donor_name, amount, token, message, created_at, creator_profile_id)
  on public.donations to anon;
grant select on public.donations to authenticated;
grant update (moderation_status) on public.donations to authenticated;

-- public_donations: public read of public columns for visible
-- confirmed/indexed donations. Readable by anon and authenticated so the
-- explore pages and leaderboard can list donations without leaking
-- donor_address, user_id, tx_hash, or hashes. Runs as the table owner
-- (security definer default for views) so it bypasses the base table's RLS.
create or replace view public.public_donations as
  select
    id,
    donor_name,
    amount,
    token,
    message,
    created_at,
    creator_profile_id
  from public.donations
  where status in ('confirmed', 'indexed')
    and moderation_status = 'visible';

grant select on public.public_donations to anon, authenticated;
