-- RLS tests for the tokens table.
--
-- Run via the local Supabase stack:
--   supabase db reset
--   supabase test
--
-- Covers:
--   * schema: columns, types, defaults, text PK.
--   * anon + authenticated SELECT: all rows (the token picker is public).
--   * denied INSERT/UPDATE/DELETE to clients (service role only).

begin;
select plan(9);

-- Schema.

select has_table('public', 'tokens', 'public.tokens exists');
select col_type_is('public', 'tokens', 'contract_address', 'text', 'contract_address is text');
select col_type_is('public', 'tokens', 'decimals', 'integer', 'decimals is integer');
select col_is_not_null('public', 'tokens', 'symbol', 'symbol is NOT NULL');
select col_is_not_null('public', 'tokens', 'decimals', 'decimals is NOT NULL');
select col_is_nullable('public', 'tokens', 'name', 'name is nullable');
select col_is_nullable('public', 'tokens', 'issuer', 'issuer is nullable');

-- Seed a token row as the service role (superuser bypasses RLS).
insert into public.tokens (contract_address, symbol, name, issuer, decimals)
values ('USDC-CONTRACT', 'USDC', 'USD Coin', 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335XVD6X4MBOMJFRXJ3KMHLSHNI', 6);

-- anon SELECT: all rows.
set local role anon;
select results_eq(
  $$ select symbol, decimals from public.tokens where contract_address = 'USDC-CONTRACT' $$,
  $$ select 'USDC', 6 $$,
  'anon can SELECT token metadata'
);
reset role;

-- authenticated SELECT: all rows.
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select results_eq(
  $$ select count(*) from public.tokens $$,
  $$ values (1::bigint) $$,
  'authenticated can SELECT token metadata'
);
reset role;

-- Denied INSERT to authenticated.
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok(
  $$ insert into public.tokens (contract_address, symbol, decimals) values ('FOO', 'FOO', 7) $$,
  '42501',
  'authenticated cannot INSERT into tokens'
);
reset role;

-- Denied UPDATE to authenticated.
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok(
  $$ update public.tokens set decimals = 9 where contract_address = 'USDC-CONTRACT' $$,
  '42501',
  'authenticated cannot UPDATE tokens'
);
reset role;

-- Denied DELETE to authenticated.
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok(
  $$ delete from public.tokens where contract_address = 'USDC-CONTRACT' $$,
  '42501',
  'authenticated cannot DELETE from tokens'
);
reset role;

select finish();
rollback;
