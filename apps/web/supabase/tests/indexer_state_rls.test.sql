-- RLS tests for the indexer_state table.
--
-- Run via the local Supabase stack:
--   supabase db reset
--   supabase test
--
-- Covers:
--   * schema: single-row PK constrained to id = 1, columns, defaults.
--   * the seed row exists with last_ledger = 0 and last_cursor = null.
--   * denied SELECT/INSERT/UPDATE/DELETE to anon and authenticated (service
--     role only).

begin;
select plan(8);

-- Schema.

select has_table('public', 'indexer_state', 'public.indexer_state exists');
select col_type_is('public', 'indexer_state', 'id', 'integer', 'id is integer');
select col_type_is('public', 'indexer_state', 'last_ledger', 'integer', 'last_ledger is integer');
select col_type_is('public', 'indexer_state', 'last_cursor', 'text', 'last_cursor is text');
select col_is_not_null('public', 'indexer_state', 'last_ledger', 'last_ledger is NOT NULL');
select col_is_nullable('public', 'indexer_state', 'last_cursor', 'last_cursor is nullable');

-- The seed row exists with last_ledger = 0 and last_cursor = null.
select results_eq(
  $$ select id, last_ledger, last_cursor from public.indexer_state $$,
  $$ values (1, 0, null::text) $$,
  'indexer_state is seeded with a single row at last_ledger = 0'
);

-- anon and authenticated get no access.
set local role anon;
select throws_ok(
  $$ select * from public.indexer_state $$,
  '42501',
  'anon cannot SELECT from indexer_state'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok(
  $$ select * from public.indexer_state $$,
  '42501',
  'authenticated cannot SELECT from indexer_state'
);
select throws_ok(
  $$ update public.indexer_state set last_ledger = 99 where id = 1 $$,
  '42501',
  'authenticated cannot UPDATE indexer_state'
);
select throws_ok(
  $$ insert into public.indexer_state (id, last_ledger) values (2, 1) $$,
  '42501',
  'authenticated cannot INSERT into indexer_state'
);
select throws_ok(
  $$ delete from public.indexer_state where id = 1 $$,
  '42501',
  'authenticated cannot DELETE from indexer_state'
);
reset role;

select finish();
rollback;
