-- Realtime publication for donations + profiles.
--
-- Supabase `postgres_changes` channels only receive events for tables that
-- belong to the `supabase_realtime` publication. The publication is created
-- empty by default, so without this migration the overlay (donations INSERT)
-- and the dashboard creator tab (profiles UPDATE) subscribe successfully but
-- never receive events, and changes only appear on a full page refresh.
--
-- Idempotent: `ALTER PUBLICATION ... ADD TABLE` errors if the table is already
-- a member, so each addition is guarded by a `pg_publication_tables` check.
-- This makes the migration safe to re-run on databases where the tables were
-- added out-of-band.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'donations'
  ) then
    alter publication supabase_realtime add table public.donations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end
$$;
