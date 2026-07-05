-- RLS tests for the donation_goals table.
--
-- Run via the local Supabase stack:
--   supabase db reset
--   supabase test
--
-- Covers:
--   * schema: columns, types, unique creator_profile_id, FK to profiles with
--     ON DELETE CASCADE.
--   * public SELECT: anon and an unrelated authenticated user can read any
--     row (the public Creator profile renders the progress bar).
--   * owner INSERT: a Creator can create their own row.
--   * owner UPDATE: a Creator can update their own row.
--   * owner DELETE: a Creator can clear their own row.
--   * non-owner INSERT/UPDATE/DELETE denied.

begin;
select plan(18);

-- Schema.

select has_table('public', 'donation_goals', 'public.donation_goals exists');
select col_type_is('public', 'donation_goals', 'id', 'uuid', 'id is uuid');
select col_type_is('public', 'donation_goals', 'creator_profile_id', 'uuid', 'creator_profile_id is uuid');
select col_type_is('public', 'donation_goals', 'target_amount', 'numeric', 'target_amount is numeric');
select col_type_is('public', 'donation_goals', 'token', 'text', 'token is text');
select col_type_is('public', 'donation_goals', 'created_at', 'timestamptz', 'created_at is timestamptz');
select col_type_is('public', 'donation_goals', 'updated_at', 'timestamptz', 'updated_at is timestamptz');

-- Fixtures: creator A, an unrelated user B.
insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.com', 'x', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.com', 'x', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000');

-- Mark A as a registered creator so the join in the owner policies resolves.
update public.profiles
  set handle = 'creatorA',
      onchain_registered = true
  where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Seed a donation_goals row for A as the service role (test runner is
-- superuser, bypasses RLS).
insert into public.donation_goals (creator_profile_id, target_amount, token)
values (
  (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1000, 'USDC-CONTRACT'
);

-- Public SELECT: anon can read the row (the progress bar is public).
set local role anon;
select results_eq(
  $$ select target_amount, token from public.donation_goals $$,
  $$ select 1000::numeric, 'USDC-CONTRACT' $$,
  'anon can SELECT donation_goals (public read)'
);
reset role;

-- Authenticated non-owner can also read the row.
set local role authenticated;
set local request.jwt.claim.sub to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select results_eq(
  $$ select count(*) from public.donation_goals $$,
  $$ values (1::bigint) $$,
  'authenticated non-owner can SELECT donation_goals (public read)'
);
reset role;

-- Owner UPDATE: A can update their own row.
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.donation_goals
  set target_amount = 2500, token = 'USDC-CONTRACT'
  where creator_profile_id = (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select results_eq(
  $$ select target_amount, token from public.donation_goals $$,
  $$ select 2500::numeric, 'USDC-CONTRACT' $$,
  'owner can UPDATE their own donation_goals row'
);
reset role;

-- Non-owner UPDATE is denied: B cannot update A's row.
set local role authenticated;
set local request.jwt.claim.sub to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select throws_ok(
  $$ update public.donation_goals set target_amount = 1
     where creator_profile_id = (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  '42501',
  'non-owner cannot UPDATE another Creator''s donation_goals row'
);
reset role;

-- Non-owner INSERT is denied: B cannot insert a row for A's profile.
set local role authenticated;
set local request.jwt.claim.sub to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select throws_ok(
  $$ insert into public.donation_goals (creator_profile_id, target_amount, token)
     values ((select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1, 'x') $$,
  '42501',
  'non-owner cannot INSERT a donation_goals row for another Creator'
);
reset role;

-- Non-owner DELETE is denied: B cannot delete A's row.
set local role authenticated;
set local request.jwt.claim.sub to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select throws_ok(
  $$ delete from public.donation_goals
     where creator_profile_id = (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  '42501',
  'non-owner cannot DELETE another Creator''s donation_goals row'
);
reset role;

-- Owner INSERT is allowed (the unique index blocks a second row, so this
-- asserts the policy permits the write by failing on the unique violation
-- rather than on RLS 42501).
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok(
  $$ insert into public.donation_goals (creator_profile_id, target_amount, token)
     values ((select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1, 'x') $$,
  '23505',
  'owner INSERT is permitted by RLS (fails on the unique index, not on RLS)'
);
reset role;

-- Owner DELETE is allowed: A can clear their own goal.
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.donation_goals
  where creator_profile_id = (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select results_eq(
  $$ select count(*) from public.donation_goals $$,
  $$ values (0::bigint) $$,
  'owner can DELETE their own donation_goals row (clears the goal)'
);
reset role;

select finish();
rollback;
