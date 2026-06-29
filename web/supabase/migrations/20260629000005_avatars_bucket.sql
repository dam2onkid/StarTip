-- avatars Storage bucket and RLS.
--
-- Both Creators and Donors upload avatars to the same public `avatars` bucket.
-- The `avatar_url` stored on `profiles` is the public URL of the uploaded
-- object. Objects are namespaced by owner: `avatars/<user_id>/<filename>`, so
-- storage RLS can grant write access to the owner via
-- `(storage.foldername(name))[1] = auth.uid()::text` (equivalently,
-- `auth.uid() = profiles.user_id` for the owner of the folder).
--
-- RLS on storage.objects:
--   * Public read: anon and authenticated can SELECT any object in the
--     `avatars` bucket (avatars appear on public profiles, leaderboards, and
--     overlays).
--   * Owner write: an authenticated user can INSERT / UPDATE / DELETE only
--     objects whose path's first segment is their own `user_id`. This is the
--     storage analogue of `auth.uid() = profiles.user_id`: the folder owner is
--     the profile owner.
--   * No public write: anon cannot write.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read of any object in the avatars bucket.
drop policy if exists "avatars_public_select" on storage.objects;
create policy "avatars_public_select"
  on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

-- Owner INSERT: the object path's first segment must be the caller's user_id.
drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner UPDATE: same path constraint on both the existing row and the new one.
drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
  on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner DELETE: same path constraint.
drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
