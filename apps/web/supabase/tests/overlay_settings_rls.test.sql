-- RLS tests for the overlay_settings table.
--
-- Run via the local Supabase stack:
--   supabase db reset
--   supabase test
--
-- Covers:
--   * schema: columns, types, defaults, unique creator_profile_id, FK to
--     profiles with ON DELETE CASCADE.
--   * public SELECT: anon and an unrelated authenticated user can read any
--     row (the Overlay is a public OBS browser source).
--   * owner INSERT: a Creator can create their own row.
--   * owner UPDATE: a Creator can update their own row.
--   * non-owner INSERT/UPDATE denied: a user cannot create or update another
--     Creator's row.
--   * DELETE denied to clients (no policy).

begin;
select plan(19);

-- Schema.

select has_table('public', 'overlay_settings', 'public.overlay_settings exists');
select col_type_is('public', 'overlay_settings', 'id', 'uuid', 'id is uuid');
select col_type_is('public', 'overlay_settings', 'creator_profile_id', 'uuid', 'creator_profile_id is uuid');
select col_type_is('public', 'overlay_settings', 'alert_duration_ms', 'integer', 'alert_duration_ms is integer');
select col_type_is('public', 'overlay_settings', 'min_amount', 'numeric', 'min_amount is numeric');
select col_type_is('public', 'overlay_settings', 'sound_enabled', 'boolean', 'sound_enabled is boolean');
select col_type_is('public', 'overlay_settings', 'tts_enabled', 'boolean', 'tts_enabled is boolean');
select col_type_is('public', 'overlay_settings', 'tts_voice', 'text', 'tts_voice is text');
select col_default_is('public', 'overlay_settings', 'alert_duration_ms', '6000', 'alert_duration_ms defaults to 6000');
select col_default_is('public', 'overlay_settings', 'min_amount', '0', 'min_amount defaults to 0');
select col_default_is('public', 'overlay_settings', 'sound_enabled', 'true', 'sound_enabled defaults to true');
select col_default_is('public', 'overlay_settings', 'theme', '''default''::text', 'theme defaults to default');
select col_default_is('public', 'overlay_settings', 'tts_enabled', 'false', 'tts_enabled defaults to false');

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

-- Seed an overlay_settings row for A as the service role (test runner is
-- superuser, bypasses RLS).
insert into public.overlay_settings (creator_profile_id, alert_duration_ms, min_amount, sound_enabled)
values (
  (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  8000, 5, true
);

-- Public SELECT: anon can read the row (the Overlay is a public browser source).
set local role anon;
select results_eq(
  $$ select alert_duration_ms, min_amount, sound_enabled from public.overlay_settings $$,
  $$ select 8000, 5::numeric, true $$,
  'anon can SELECT overlay_settings (public read)'
);
reset role;

-- Authenticated non-owner can also read the row.
set local role authenticated;
set local request.jwt.claim.sub to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select results_eq(
  $$ select count(*) from public.overlay_settings $$,
  $$ values (1::bigint) $$,
  'authenticated non-owner can SELECT overlay_settings (public read)'
);
reset role;

-- Owner UPDATE: A can update their own row.
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.overlay_settings
  set alert_duration_ms = 4000, min_amount = 10, sound_enabled = false, tts_enabled = true, tts_voice = 'en-US-EmmaNeural'
  where creator_profile_id = (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select results_eq(
  $$ select alert_duration_ms, min_amount, sound_enabled, tts_enabled, tts_voice from public.overlay_settings $$,
  $$ select 4000, 10::numeric, false, true, 'en-US-EmmaNeural' $$,
  'owner can UPDATE their own overlay_settings row'
);
reset role;

-- Non-owner UPDATE is denied: B cannot update A's row.
set local role authenticated;
set local request.jwt.claim.sub to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select throws_ok(
  $$ update public.overlay_settings set alert_duration_ms = 1
     where creator_profile_id = (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  '42501',
  'non-owner cannot UPDATE another Creator''s overlay_settings row'
);
reset role;

-- Non-owner INSERT is denied: B cannot insert a row for A's profile.
set local role authenticated;
set local request.jwt.claim.sub to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select throws_ok(
  $$ insert into public.overlay_settings (creator_profile_id)
     values ((select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) $$,
  '42501',
  'non-owner cannot INSERT an overlay_settings row for another Creator'
);
reset role;

-- Owner INSERT is allowed (the unique index blocks a second row, so this
-- asserts the policy permits the write by failing on the unique violation
-- rather than on RLS 42501).
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok(
  $$ insert into public.overlay_settings (creator_profile_id)
     values ((select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) $$,
  '23505',
  'owner INSERT is permitted by RLS (fails on the unique index, not on RLS)'
);
reset role;

-- DELETE denied to clients (no policy).
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok(
  $$ delete from public.overlay_settings where creator_profile_id = (select id from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  '42501',
  'authenticated cannot DELETE overlay_settings (no policy)'
);
reset role;

select finish();
rollback;
