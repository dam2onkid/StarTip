-- Add Alert Reading (Text-to-Speech) columns to overlay_settings.
--
-- `tts_enabled` is the creator-facing on/off switch for Alert Reading.
-- `tts_voice` is the provider-specific voice identifier (null when no voice
-- has been chosen, which is treated as "Alert Reading unconfigured").
--
-- RLS column grants are extended so authenticated owners can INSERT/UPDATE
-- these fields alongside the existing columns.

alter table public.overlay_settings
  add column if not exists tts_enabled boolean not null default false;

alter table public.overlay_settings
  add column if not exists tts_voice text;

-- Extend column-level grants for owner INSERT/UPDATE.
grant insert (tts_enabled, tts_voice) on public.overlay_settings to authenticated;
grant update (tts_enabled, tts_voice) on public.overlay_settings to authenticated;
