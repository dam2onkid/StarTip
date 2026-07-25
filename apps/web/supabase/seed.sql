-- Seed file loaded after migrations during `supabase db reset` and `supabase test db`.
-- Enables the pgTAP extension used by the RLS test suite in the local/test database.
create extension if not exists pgtap with schema extensions;
