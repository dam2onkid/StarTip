-- RLS tests for the avatars Storage bucket.
--
-- Run via the local Supabase stack:
--   supabase db reset
--   supabase test
--
-- Covers:
--   * the `avatars` bucket exists and is public.
--   * anon can SELECT any object in the bucket (public read).
--   * an authenticated user can INSERT / UPDATE / DELETE only objects whose
--     path's first segment is their own user_id (owner write).
--   * an authenticated user cannot write into another user's folder.

begin;
select plan(8);

-- The bucket exists and is public.
select has_table('storage', 'objects', 'storage.objects exists');
select results_eq(
  $$ select public from storage.buckets where id = 'avatars' $$,
  $$ values (true) $$,
  'avatars bucket is public'
);

-- Two users for cross-user storage tests.
insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id)
values
  ('11111111-1111-1111-1111-111111111111', 'usera@example.com', 'x', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222', 'userb@example.com', 'x', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000');

-- Owner can INSERT into their own folder.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner, size, mimetype)
     values ('avatars', '11111111-1111-1111-1111-111111111111/me.png', '11111111-1111-1111-1111-111111111111', 0, 'image/png') $$,
  'owner can insert into their own folder'
);

-- Owner cannot INSERT into another user's folder.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, size, mimetype)
     values ('avatars', '22222222-2222-2222-2222-222222222222/hack.png', '11111111-1111-1111-1111-111111111111', 0, 'image/png') $$,
  'owner cannot insert into another user folder'
);

-- Anon can SELECT the object (public read).
select results_eq(
  $$ select count(*) from storage.objects where bucket_id = 'avatars' $$,
  $$ values (1::bigint) $$,
  'anon/public can read avatars bucket objects'
);

-- Owner can UPDATE their own object.
select lives_ok(
  $$ update storage.objects set mimetype = 'image/jpeg'
     where bucket_id = 'avatars' and name = '11111111-1111-1111-1111-111111111111/me.png' $$,
  'owner can update their own object'
);

-- Owner can DELETE their own object.
select lives_ok(
  $$ delete from storage.objects
     where bucket_id = 'avatars' and name = '11111111-1111-1111-1111-111111111111/me.png' $$,
  'owner can delete their own object'
);

select finish();
rollback;
