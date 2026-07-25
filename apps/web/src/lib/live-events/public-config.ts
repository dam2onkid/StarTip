import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_EFFECT_IDS,
  resolveEffectPrices,
} from "@startip/shared/live-events/pricing";

/**
 * Public Live Events configuration read for the donate page and
 * `/api/creators/[handle]/live-events`.
 *
 * Returns the Creator's opt-in flag, Default Pack effect identifiers, and
 * current minimum prices. The service client (service role, bypasses RLS) is
 * used because this function is called from server-side contexts. Only public
 * fields are exposed in the response body; the underlying table may contain
 * columns that should not leak to donors.
 */

export interface LiveEventsPublicConfigDeps {
  service: SupabaseClient;
}

export interface LiveEventsPublicConfigBody {
  live_events_enabled: boolean;
  effects: Record<string, { name: string; price: number }>;
}

export interface LiveEventsPublicConfigErrorBody {
  error: string;
}

export interface LiveEventsPublicConfigResult {
  status: 200 | 400 | 404 | 500;
  body: LiveEventsPublicConfigBody | LiveEventsPublicConfigErrorBody;
}

interface ProfileRow {
  id: string;
  onchain_registered: boolean;
  paused: boolean;
}

interface SettingsRow {
  live_events_enabled: boolean;
  screen_flash_price: number;
  jump_scare_price: number;
  tunnel_vision_price: number;
  screen_cover_price: number;
}

const EFFECT_DISPLAY_NAMES: Record<string, string> = {
  "screen-flash": "Screen Flash",
  "jump-scare": "Jump Scare",
  "tunnel-vision": "Tunnel Vision",
  "screen-cover": "Screen Cover",
};

export async function getLiveEventsPublicConfig(
  deps: LiveEventsPublicConfigDeps,
  handle: string,
): Promise<LiveEventsPublicConfigResult> {
  const normalized = typeof handle === "string" ? handle.trim().toLowerCase() : "";
  if (!normalized) {
    return { status: 400, body: { error: "missing_handle" } };
  }

  const { data: profile, error: profileErr } = await deps.service
    .from("profiles")
    .select("id,onchain_registered,paused")
    .eq("handle", normalized)
    .maybeSingle();
  if (profileErr) return { status: 500, body: { error: "db_error" } };

  const p = profile as ProfileRow | null;
  if (!p || !p.onchain_registered || p.paused) {
    return { status: 404, body: { error: "creator_not_found" } };
  }

  const { data: row, error: rowErr } = await deps.service
    .from("live_event_settings")
    .select("live_events_enabled,screen_flash_price,jump_scare_price,tunnel_vision_price,screen_cover_price")
    .eq("creator_profile_id", p.id)
    .maybeSingle();
  if (rowErr) return { status: 500, body: { error: "db_error" } };

  const settingsRow = row as SettingsRow | null;
  const enabled = settingsRow?.live_events_enabled ?? false;

  const storedPrices = settingsRow
    ? {
        "screen-flash": settingsRow.screen_flash_price,
        "jump-scare": settingsRow.jump_scare_price,
        "tunnel-vision": settingsRow.tunnel_vision_price,
        "screen-cover": settingsRow.screen_cover_price,
      }
    : null;
  const prices = resolveEffectPrices(storedPrices);

  const effects: Record<string, { name: string; price: number }> = {};
  for (const id of DEFAULT_EFFECT_IDS) {
    effects[id] = { name: EFFECT_DISPLAY_NAMES[id], price: prices[id] };
  }

  return { status: 200, body: { live_events_enabled: enabled, effects } };
}
