-- Backfill profiles rows for auth.users that predate the autocreate trigger.
--
-- The on_auth_user_created trigger (20260629000001_profiles.sql) only fires
-- AFTER INSERT on auth.users. Any user who signed up before that migration
-- was applied has an auth.users row but no profiles row, so every authed
-- endpoint that loads the caller's profile returns profile_not_found.
--
-- This migration is idempotent: it inserts a profiles row only for auth.users
-- that do not already have one. Re-running is a no-op. Runs as the migration
-- owner (service role / superuser) so it bypasses RLS and the denied-INSERT
-- policy, exactly like the security-definer trigger does for new signups.

insert into public.profiles (user_id)
select u.id
from auth.users u
where not exists (
  select 1 from public.profiles p where p.user_id = u.id
);
