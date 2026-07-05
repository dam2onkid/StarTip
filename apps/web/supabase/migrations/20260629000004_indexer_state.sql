-- indexer_state table and RLS.
--
-- Single-row cursor for the indexer poll job. Stores the last processed
-- ledger and the getEvents pagination cursor so the poll resumes from the
-- last processed event across invocations.
--
-- RLS: no client access. Only the service role (the indexer route handler)
-- reads and writes this table; it bypasses RLS.

create table if not exists public.indexer_state (
  id              int primary key default 1 check (id = 1),
  last_ledger     int not null,
  last_cursor     text,
  updated_at      timestamptz not null default now()
);

-- Row Level Security: enabled with no policies. anon and authenticated get
-- no grants and no policies, so all client access is denied. The service role
-- bypasses RLS.
alter table public.indexer_state enable row level security;

revoke all on public.indexer_state from anon, authenticated;

-- Seed the single row. last_ledger = 0 means "uninitialized"; the indexer
-- bootstraps from rpc.getLatestLedger() on the first poll when it sees 0.
insert into public.indexer_state (id, last_ledger, last_cursor)
values (1, 0, null)
on conflict (id) do nothing;
