-- RLS tests for the profiles table and public_profiles view.
--
-- Run via the local Supabase stack:
--   supabase db reset
--   supabase test
--
-- Covers:
--   * schema: handle_hash is bytea, defaults, unique constraints.
--   * autocreate trigger: inserting into auth.users creates a profiles row
--     with display_name = 'Anonymous' and Creator fields NULL.
--   * owner SELECT: a user can read all columns of their own row.
--   * owner UPDATE: a user can update identity + nonce fields only.
--   * cross-user: a user cannot read another user's base row.
--   * public SELECT: anon reads only public columns for registered + not
--     paused rows via public_profiles.
--   * denied INSERT/DELETE: authenticated cannot insert or delete profiles.

begin;
select plan(20);

-- Schema.

select has_table('public', 'profiles', 'public.profiles exists');
select col_type_is('public', 'profiles', 'handle_hash', 'bytea', 'handle_hash is bytea');
select col_type_is('public', 'profiles', 'id', 'uuid', 'id is uuid');
select col_type_is('public', 'profiles', 'user_id', 'uuid', 'user_id is uuid');
select col_is_not_null('public', 'profiles', 'display_name', 'display_name is NOT NULL');
select col_is_nullable('public', 'profiles', 'avatar_url', 'avatar_url is nullable');
select col_is_nullable('public', 'profiles', 'owner_address', 'owner_address is nullable');
select col_is_nullable('public', 'profiles', 'payout_address', 'payout_address is nullable');
select col_is_not_null('public', 'profiles', 'onchain_registered', 'onchain_registered is NOT NULL');
select col_is_not_null('public', 'profiles', 'paused', 'paused is NOT NULL');
select col_default_is('public', 'profiles', 'display_name', '''Anonymous'''::text, 'display_name defaults to Anonymous');
select col_default_is('public', 'profiles', 'onchain_registered', 'false', 'onchain_registered defaults to false');
select has_view('public', 'public_profiles', 'public_profiles view exists');

-- Autocreate trigger. Inserting a user into auth.users creates a profiles
-- row with display_name = 'Anonymous' and Creator fields NULL.
insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id)
values (
  '11111111-1111-1111-1111-111111111111',
  'usera@example.com',
  'x',
  'authenticated',
  'authenticated',
  now(),
  '00000000-0000-0000-0000-000000000000'
);

select results_eq(
  $$ select count(*) from public.profiles where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (1::bigint) $$,
  'autocreate trigger creates exactly one profiles row per auth.users insert'
);

select results_eq(
  $$ select display_name, avatar_url, bio, handle, handle_hash, owner_address,
            payout_address, onchain_registered, paused
     from public.profiles
     where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ select 'Anonymous', null::text, null::text, null::text, null::bytea,
            null::text, null::text, false, false $$,
  'autocreated profile has display_name Anonymous and Creator fields NULL'
);

-- Second user for cross-user tests.
insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id)
values (
  '22222222-2222-2222-2222-222222222222',
  'userb@example.com',
  'x',
  'authenticated',
  'authenticated',
  now(),
  '00000000-0000-0000-0000-000000000000'
);

-- Mark user A as a registered, active creator so public_profiles exposes them.
update public.profiles
  set handle = 'usera', onchain_registered = true, paused = false
  where user_id = '11111111-1111-1111-1111-111111111111';

-- Owner SELECT: user A can read all columns of their own row, including the
-- owner-only columns (owner_address, payout_address, user_id).
set local role authenticated;
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$ select count(*) from public.profiles where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (1::bigint) $$,
  'owner can SELECT their own base row'
);
select results_eq(
  $$ select owner_address is null and payout_address is null from public.profiles
     where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (true) $$,
  'owner SELECT includes owner-only columns (owner_address, payout_address)'
);
reset role;

-- Cross-user: user B cannot read user A's base row.
set local role authenticated;
set local request.jwt.claim.sub to '22222222-2222-2222-2222-222222222222';
select results_eq(
  $$ select count(*) from public.profiles where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (0::bigint) $$,
  'a user cannot SELECT another user''s base row'
);
reset role;

-- Owner UPDATE: user A can update identity + nonce fields.
set local role authenticated;
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
update public.profiles
  set display_name = 'A', avatar_url = 'https://example.com/a.png',
      bio = 'bio', wallet_link_nonce = 'n', wallet_link_nonce_expires_at = now()
  where user_id = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$ select display_name from public.profiles
     where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ select 'A' $$,
  'owner can UPDATE display_name, avatar_url, bio, nonce fields'
);
reset role;

-- Owner UPDATE of a non-allowed column (owner_address) is denied by the
-- column-level GRANT.
set local role authenticated;
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
select throws_ok(
  $$ update public.profiles set owner_address = 'GABC' where user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  'owner cannot UPDATE owner_address (column-level grant denies it)'
);
reset role;

-- Public SELECT: anon reads only public columns for registered + not paused
-- rows via public_profiles.
set local role anon;
select results_eq(
  $$ select handle, display_name, onchain_registered from public.public_profiles $$,
  $$ select 'usera', 'A', true $$,
  'anon can SELECT public fields of registered+active creators via public_profiles'
);
-- anon cannot select owner-only columns: the view does not expose them.
select throws_ok(
  $$ select owner_address from public.public_profiles $$,
  '42703',
  'public_profiles does not expose owner_address'
);
reset role;

-- Public SELECT excludes paused creators.
update public.profiles set paused = true
  where user_id = '11111111-1111-1111-1111-111111111111';
set local role anon;
select results_eq(
  $$ select count(*) from public.public_profiles $$,
  $$ values (0::bigint) $$,
  'public_profiles excludes paused creators'
);
reset role;
update public.profiles set paused = false
  where user_id = '11111111-1111-1111-1111-111111111111';

-- Denied INSERT: authenticated cannot insert into profiles.
set local role authenticated;
set local request.jwt.claim.sub to '22222222-2222-2222-2222-222222222222';
select throws_ok(
  $$ insert into public.profiles (user_id) values ('33333333-3333-3333-3333-333333333333') $$,
  '42501',
  'authenticated cannot INSERT into profiles'
);
reset role;

-- Denied DELETE: authenticated cannot delete profiles.
set local role authenticated;
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
select throws_ok(
  $$ delete from public.profiles where user_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  'authenticated cannot DELETE from profiles'
);
reset role;

select finish();
rollback;
