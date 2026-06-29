-- tokens table and RLS.
--
-- Cached metadata for SAC tokens on the DonationRouter allowlist. The indexer
-- populates a row (with a one-time SAC contract read for symbol, name,
-- decimals, issuer) when it sees a TokenAllowlistUpdated { added = true }
-- event, and deletes it on { added = false }. The donate page reads this
-- table to render the token picker without an RPC call per prepare.
--
-- RLS:
--   * anon + authenticated: SELECT all columns (the token picker is public).
--   * INSERT/UPDATE/DELETE: denied to clients (no policy); service role only
--     (the indexer writes these rows).

create table if not exists public.tokens (
  contract_address    text primary key,
  symbol              text not null,
  name                text,
  issuer              text,
  decimals            int not null,
  icon_url            text,
  created_at          timestamptz not null default now()
);

-- Row Level Security.

alter table public.tokens enable row level security;

-- Public read: anyone can list tokens and their metadata.
drop policy if exists "tokens_public_select" on public.tokens;
create policy "tokens_public_select"
  on public.tokens
  for select to anon, authenticated
  using (true);

-- No INSERT, UPDATE, or DELETE policies: clients cannot mutate tokens.
-- The service role (indexer) bypasses RLS.

revoke all on public.tokens from anon, authenticated;
grant select on public.tokens to anon, authenticated;
