-- Add banner_url to profiles: the public Creator page cover image.
--
-- Shapes the Twitter-style cover on `/creator/[handle]`. When null, the page
-- falls back to the default atmospheric gradient banner (DESIGN.md), so the
-- column is optional and adds no required-field migration burden.
--
-- RLS: consistent with avatar_url/bio, the owner may UPDATE banner_url (added
-- to the column-level grant below). Public read is exposed through the
-- public_profiles view (recreated to include banner_url).

alter table public.profiles
  add column if not exists banner_url text;

-- Owner can UPDATE their own banner, mirroring avatar_url / bio.
grant update (banner_url) on public.profiles to authenticated;

-- Recreate the public read view to expose banner_url alongside the other
-- public fields. All sensitive columns stay excluded.
create or replace view public.public_profiles as
  select
    handle,
    display_name,
    avatar_url,
    banner_url,
    bio,
    onchain_registered
  from public.profiles
  where onchain_registered = true and paused = false;

grant select on public.public_profiles to anon, authenticated;
