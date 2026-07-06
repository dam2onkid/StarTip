-- Include `id` in the anon column grant for donations Realtime payloads.
--
-- The overlay subscribes to `public.donations` as anon and needs `id` to
-- de-duplicate inserts and apply later UPDATE events to the queued alert. The
-- original column-level grant exposed the public display columns but omitted
-- `id`, which can leave Realtime payloads without the queue key even though
-- the server-rendered initial query uses the service role.

grant select
  (id, donor_name, amount, token, message, created_at, creator_profile_id)
  on public.donations to anon;
