-- donation_goals table and RLS.
--
-- Per-Creator donation goal (spec §6.2, PRD "Donation goal"). A Creator sets a
-- target amount denominated in a single token from the allowlist; the
-- dashboard renders a progress card (current vs. target) and the public
-- Creator profile renders a progress bar. The progress reflects only
-- confirmed/indexed visible donations in the goal's token, summed with
-- `BigInt` in `lib/creators/goal.ts`.
--
-- One row per Creator (unique `creator_profile_id`); no row = no goal
-- displayed. The Creator can clear the goal by sending `target_amount = 0` to
-- the PUT route, which deletes the row.
--
-- `token` is the SAC contract address (text), matching the `donations.token`
-- and `tokens.contract_address` columns. It must be in the `tokens` allowlist;
-- the API route validates this on PUT.
--
-- RLS:
--   * anon + authenticated: SELECT all columns (the public Creator profile
--     renders the progress bar without a session).
--   * Owner (auth.uid() = profiles.user_id join on creator_profile_id) can
--     INSERT, UPDATE, and DELETE their row. Non-owners cannot mutate.

create table if not exists public.donation_goals (
  id                  uuid primary key default gen_random_uuid(),
  creator_profile_id  uuid not null references public.profiles(id) on delete cascade,
  target_amount       numeric not null,
  token               text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One row per Creator: the PUT route upserts on `creator_profile_id`.
create unique index if not exists donation_goals_creator_profile_id_key
  on public.donation_goals (creator_profile_id);

-- Row Level Security.

alter table public.donation_goals enable row level security;

-- Public read: the Creator profile progress bar is public.
drop policy if exists "donation_goals_public_select" on public.donation_goals;
create policy "donation_goals_public_select"
  on public.donation_goals
  for select to anon, authenticated
  using (true);

-- Owner INSERT: a Creator can create their own row (the upsert on first PUT).
drop policy if exists "donation_goals_owner_insert" on public.donation_goals;
create policy "donation_goals_owner_insert"
  on public.donation_goals
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = donation_goals.creator_profile_id
        and p.user_id = auth.uid()
    )
  );

-- Owner UPDATE: only the Creator that owns the row may mutate it. WITH CHECK
-- keeps the row bound to the same owner.
drop policy if exists "donation_goals_owner_update" on public.donation_goals;
create policy "donation_goals_owner_update"
  on public.donation_goals
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = donation_goals.creator_profile_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = donation_goals.creator_profile_id
        and p.user_id = auth.uid()
    )
  );

-- Owner DELETE: a Creator can clear their goal (the PUT route sends
-- `target_amount = 0` -> DELETE). Non-owners cannot delete.
drop policy if exists "donation_goals_owner_delete" on public.donation_goals;
create policy "donation_goals_owner_delete"
  on public.donation_goals
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = donation_goals.creator_profile_id
        and p.user_id = auth.uid()
    )
  );

-- Column-level grants. anon + authenticated get SELECT (the progress bar is
-- public); authenticated get INSERT + UPDATE + DELETE on all updatable
-- columns.
revoke all on public.donation_goals from anon, authenticated;
grant select on public.donation_goals to anon, authenticated;
grant insert (creator_profile_id, target_amount, token)
  on public.donation_goals to authenticated;
grant update (target_amount, token)
  on public.donation_goals to authenticated;
grant delete on public.donation_goals to authenticated;

-- updated_at touch on every UPDATE so the dashboard can show "last saved".
create or replace function public.touch_donation_goals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists donation_goals_set_updated_at on public.donation_goals;
create trigger donation_goals_set_updated_at
  before update on public.donation_goals
  for each row execute procedure public.touch_donation_goals_updated_at();
