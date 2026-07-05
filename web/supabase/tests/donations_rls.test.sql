-- RLS tests for the donations table and public_donations view.
--
-- Run via the local Supabase stack:
--   supabase db reset
--   supabase test
--
-- Covers:
--   * schema: columns, types, defaults, unique tx_hash, FK to profiles.
--   * ADR-0005: donation_id_hash column is gone; status is constrained to
--     confirmed/indexed (no pending).
--   * anon SELECT: only public columns of visible confirmed/indexed rows.
--   * anon cannot read private columns (column-level grant denies it).
--   * anon does not see hidden rows.
--   * creator SELECT: all columns of received donations, including hidden.
--   * donor SELECT: all columns of own donations (any status).
--   * authenticated non-creator non-donor: no base-table rows; public columns
--     via public_donations.
--   * denied INSERT/DELETE to clients.
--   * creator UPDATE moderation_status allowed; other columns denied by column
--     grant; donor UPDATE denied by RLS.

begin;
select plan(26);

-- Schema.

select has_table('public', 'donations', 'public.donations exists');
select col_type_is('public', 'donations', 'id', 'uuid', 'id is uuid');
select hasnt_column('public', 'donations', 'donation_id_hash', 'donation_id_hash column was dropped (ADR-0005)');
select col_type_is('public', 'donations', 'handle_hash', 'bytea', 'handle_hash is bytea');
select col_type_is('public', 'donations', 'amount', 'numeric', 'amount is numeric');
select col_is_not_null('public', 'donations', 'creator_profile_id', 'creator_profile_id is NOT NULL');
select col_is_nullable('public', 'donations', 'tx_hash', 'tx_hash is nullable');
select col_default_is('public', 'donations', 'status', '''pending'''::text, 'status defaults to pending');
select col_default_is('public', 'donations', 'moderation_status', '''visible'''::text, 'moderation_status defaults to visible');
select col_default_is('public', 'donations', 'donor_name', '''Anonymous'''::text, 'donor_name defaults to Anonymous');
select has_view('public', 'public_donations', 'public_donations view exists');

-- ADR-0005: status is constrained to confirmed/indexed. Inserting pending
-- must fail with a CHECK violation.
select throws_ok(
  $$ insert into public.donations
       (tx_hash, creator_profile_id, handle_hash, token, amount, status)
     values ('tx-bad-status',
       (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
       decode('ab' || repeat('ab', 31), 'hex'), 'USDC-CONTRACT', 1, 'pending') $$,
  '23514',
  'inserting status=pending fails the donations_status_check constraint'
);

-- Fixtures: creator A, donor B, and an unrelated user C.
insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.com', 'x', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.com', 'x', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@example.com', 'x', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000');

-- Mark A as a registered creator with a handle_hash so donations can reference
-- their profile. B is just a donor.
update public.profiles
  set handle = 'creatorA',
      handle_hash = decode('ab' || repeat('ab', 31), 'hex'),
      owner_address = 'GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA',
      onchain_registered = true
  where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select results_eq(
  $$ select count(*) from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values (1::bigint) $$,
  'creator A profile exists'
);

-- Insert donations as the service role (test runner is superuser, bypasses
-- RLS). One visible confirmed, one hidden confirmed, one visible indexed.
insert into public.donations
  (id, tx_hash, creator_profile_id, handle_hash, token, amount, message, donor_name, user_id, status, moderation_status)
values
  ('11111111-1111-1111-1111-111111111111', 'tx-visible',
   (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
   decode('ab' || repeat('ab', 31), 'hex'), 'USDC-CONTRACT', 1000, 'hi', 'DonorB',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'confirmed', 'visible'),
  ('22222222-2222-2222-2222-222222222222', 'tx-hidden',
   (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
   decode('ab' || repeat('ab', 31), 'hex'), 'USDC-CONTRACT', 500, 'secret', 'DonorB',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'confirmed', 'hidden'),
  ('33333333-3333-3333-3333-333333333333', 'tx-indexed',
   (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
   decode('ab' || repeat('ab', 31), 'hex'), 'USDC-CONTRACT', 250, null, 'DonorB',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'indexed', 'visible');

-- anon SELECT: only the public columns of visible confirmed/indexed rows.
set local role anon;
select results_eq(
  $$ select count(*) from (
    select donor_name, amount, token, message, created_at, creator_profile_id
    from public.donations
  ) t $$,
  $$ values (2::bigint) $$,
  'anon sees the two visible donations (confirmed + indexed), not the hidden one'
);
-- anon cannot read private columns (column-level grant denies it).
select throws_ok(
  $$ select tx_hash from public.donations $$,
  '42501',
  'anon cannot SELECT tx_hash (column grant denies it)'
);
reset role;

-- anon does not see hidden rows via the public_donations view.
set local role anon;
select results_eq(
  $$ select count(*) from public.public_donations $$,
  $$ values (2::bigint) $$,
  'public_donations exposes the two visible donations (confirmed + indexed)'
);
reset role;

-- creator A SELECT: all columns of their received donations, including hidden
-- (3 rows total).
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select results_eq(
  $$ select count(*) from public.donations $$,
  $$ values (3::bigint) $$,
  'creator sees all 3 of their received donations (visible confirmed, hidden confirmed, indexed)'
);
select results_eq(
  $$ select count(*) from public.donations where moderation_status = 'hidden' $$,
  $$ values (1::bigint) $$,
  'creator SELECT includes hidden donations'
);
reset role;

-- donor B SELECT: all columns of their own donations (3 rows, any status).
set local role authenticated;
set local request.jwt.claim.sub to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select results_eq(
  $$ select count(*) from public.donations $$,
  $$ values (3::bigint) $$,
  'donor sees all 3 of their own donations'
);
reset role;

-- authenticated non-creator non-donor (C): no base-table rows.
set local role authenticated;
set local request.jwt.claim.sub to 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select results_eq(
  $$ select count(*) from public.donations $$,
  $$ values (0::bigint) $$,
  'an unrelated authenticated user sees no base donations rows'
);
-- but C can read public columns of visible confirmed/indexed rows via the view.
select results_eq(
  $$ select count(*) from public.public_donations $$,
  $$ values (2::bigint) $$,
  'unrelated authenticated user sees visible confirmed/indexed donations via the view'
);
reset role;

-- Denied INSERT to authenticated.
set local role authenticated;
set local request.jwt.claim.sub to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select throws_ok(
  $$ insert into public.donations (creator_profile_id, handle_hash, token, amount)
     values ((select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
             decode('ab' || repeat('ab', 31), 'hex'), 'USDC-CONTRACT', 1) $$,
  '42501',
  'authenticated cannot INSERT into donations'
);
reset role;

-- Denied DELETE to authenticated (even the creator).
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok(
  $$ delete from public.donations where status = 'indexed' $$,
  '42501',
  'creator cannot DELETE donations'
);
reset role;

-- Creator can UPDATE moderation_status on their received donations.
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.donations set moderation_status = 'hidden'
  where tx_hash = 'tx-visible';
select results_eq(
  $$ select moderation_status from public.donations where tx_hash = 'tx-visible' $$,
  $$ select 'hidden' $$,
  'creator can UPDATE moderation_status on their received donations'
);
reset role;

-- Creator cannot UPDATE a non-moderation column (column grant denies it).
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok(
  $$ update public.donations set amount = 999 where tx_hash = 'tx-visible' $$,
  '42501',
  'creator cannot UPDATE amount (column grant denies it)'
);
reset role;

-- Donor cannot UPDATE moderation_status (RLS policy denies the row: donor is
-- not the creator).
set local role authenticated;
set local request.jwt.claim.sub to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select throws_ok(
  $$ update public.donations set moderation_status = 'hidden' where tx_hash = 'tx-hidden' $$,
  '42501',
  'donor cannot UPDATE moderation_status (not the creator)'
);
reset role;

select finish();
rollback;
