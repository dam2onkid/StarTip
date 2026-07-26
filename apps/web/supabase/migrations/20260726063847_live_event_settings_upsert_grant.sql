-- Allow `creator_profile_id` to appear in the `SET` clause of the
-- `INSERT ... ON CONFLICT DO UPDATE` used by `/api/creators/[handle]/live-events` PUT.
--
-- The `live_event_settings_owner_update` RLS policy still constrains
-- `creator_profile_id` to the caller's own profile, so this grant cannot be
-- abused to repoint the row to another Creator.

grant update (creator_profile_id) on public.live_event_settings to authenticated;
