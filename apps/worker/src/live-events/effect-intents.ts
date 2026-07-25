import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_EFFECT_IDS,
  DEFAULT_PACK_PRICES,
  PLATFORM_FLOOR_USDC,
  rawMinimumAmount,
} from "@startip/shared/live-events/pricing";

/**
 * Worker Live Events - Effect Intent creation.
 *
 * `POST /live-events/effect-intents` creates a single-use, expiring off-chain
 * Effect Intent that binds a Donor's selected effect to a Creator, token,
 * raw amount, pack version, and donation preparation identity. The Creator
 * must have Live Events enabled and the offered amount must meet the current
 * Effect Price. If the Creator disables Live Events before the request, the
 * server rejects the attempt even though a stale client may submit effect data.
 */

export interface LiveEventsDeps {
  /** Service-role client (bypasses RLS). Reads settings and inserts intents. */
  service: SupabaseClient;
}

export interface EffectIntentInput {
  handle: string;
  token: string;
  amount: string;
  effect_id: string;
  pack_id: string;
  pack_version: string;
  donation_prep_id: string;
}

export interface EffectIntentSuccessBody {
  effect_intent_id: string;
  raw_amount: string;
  expires_at: string;
}

export interface EffectIntentErrorBody {
  error: string;
}

export interface EffectIntentResult {
  status: 201 | 400 | 401 | 403 | 404 | 409 | 500;
  body: EffectIntentSuccessBody | EffectIntentErrorBody;
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

interface TokenRow {
  contract_address: string;
  decimals: number;
}

const EFFECT_INTENT_EXPIRY_MS = 10 * 60 * 1000;

function priceForEffect(settings: SettingsRow, effectId: string): number {
  switch (effectId) {
    case "screen-flash":
      return settings.screen_flash_price;
    case "jump-scare":
      return settings.jump_scare_price;
    case "tunnel-vision":
      return settings.tunnel_vision_price;
    case "screen-cover":
      return settings.screen_cover_price;
    default:
      return DEFAULT_PACK_PRICES[effectId as keyof typeof DEFAULT_PACK_PRICES] ?? 0;
  }
}

function isDefaultEffectId(effectId: string): effectId is typeof DEFAULT_EFFECT_IDS[number] {
  return (DEFAULT_EFFECT_IDS as readonly string[]).includes(effectId);
}

export async function createEffectIntent(
  deps: LiveEventsDeps,
  input: EffectIntentInput,
): Promise<EffectIntentResult> {
  const { service } = deps;

  const handle = typeof input.handle === "string" ? input.handle.trim().toLowerCase() : "";
  const token = typeof input.token === "string" ? input.token.trim() : "";
  const amount = typeof input.amount === "string" ? input.amount.trim() : "";
  const effectId = typeof input.effect_id === "string" ? input.effect_id.trim() : "";
  const packId = typeof input.pack_id === "string" ? input.pack_id.trim() : "";
  const packVersion = typeof input.pack_version === "string" ? input.pack_version.trim() : "";
  const donationPrepId = typeof input.donation_prep_id === "string" ? input.donation_prep_id.trim() : "";

  if (!handle || !token || !amount || !effectId || !packId || !packVersion || !donationPrepId) {
    return { status: 400, body: { error: "invalid_body" } };
  }

  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("id,onchain_registered,paused")
    .eq("handle", handle)
    .maybeSingle();
  if (profileErr) return { status: 500, body: { error: "db_error" } };
  const p = profile as ProfileRow | null;
  if (!p || !p.onchain_registered || p.paused) {
    return { status: 404, body: { error: "creator_not_found" } };
  }

  const { data: settings, error: settingsErr } = await service
    .from("live_event_settings")
    .select("live_events_enabled,screen_flash_price,jump_scare_price,tunnel_vision_price,screen_cover_price")
    .eq("creator_profile_id", p.id)
    .maybeSingle();
  if (settingsErr) return { status: 500, body: { error: "db_error" } };

  // When no row exists, Live Events are disabled by default and all prices
  // fall back to the Default Pack values.
  const settingsRow = settings as SettingsRow | null;
  const enabled = settingsRow?.live_events_enabled ?? false;
  if (!enabled) {
    return { status: 403, body: { error: "live_events_disabled" } };
  }

  if (!isDefaultEffectId(effectId)) {
    return { status: 400, body: { error: "invalid_effect" } };
  }

  const { data: tokenRow, error: tokenErr } = await service
    .from("tokens")
    .select("contract_address,decimals")
    .eq("contract_address", token)
    .maybeSingle();
  if (tokenErr) return { status: 500, body: { error: "db_error" } };
  if (!tokenRow) return { status: 400, body: { error: "token_not_found" } };

  const decimals = (tokenRow as TokenRow).decimals ?? 0;
  const displayNum = Number(amount);
  if (!Number.isFinite(displayNum) || displayNum <= 0) {
    return { status: 400, body: { error: "invalid_amount" } };
  }

  const rawAmount = rawMinimumAmount(displayNum, decimals);
  if (rawAmount === null) return { status: 400, body: { error: "invalid_amount" } };

  const effectPrice = priceForEffect(settingsRow ?? {
    live_events_enabled: true,
    screen_flash_price: DEFAULT_PACK_PRICES["screen-flash"],
    jump_scare_price: DEFAULT_PACK_PRICES["jump-scare"],
    tunnel_vision_price: DEFAULT_PACK_PRICES["tunnel-vision"],
    screen_cover_price: DEFAULT_PACK_PRICES["screen-cover"],
  }, effectId);

  const rawPrice = rawMinimumAmount(effectPrice, decimals);
  if (rawPrice === null) return { status: 500, body: { error: "db_error" } };

  const rawFloor = rawMinimumAmount(PLATFORM_FLOOR_USDC, decimals);
  if (rawFloor === null) return { status: 500, body: { error: "db_error" } };

  if (BigInt(rawPrice) < BigInt(rawFloor)) {
    return { status: 400, body: { error: "price_below_floor" } };
  }
  if (BigInt(rawAmount) < BigInt(rawPrice)) {
    return { status: 400, body: { error: "amount_below_price" } };
  }

  const expiresAt = new Date(Date.now() + EFFECT_INTENT_EXPIRY_MS).toISOString();

  const { data: inserted, error: insertErr } = await service
    .from("effect_intents")
    .insert({
      creator_profile_id: p.id,
      token,
      raw_amount: rawAmount,
      pack_id: packId,
      pack_version: packVersion,
      effect_id: effectId,
      donation_prep_id: donationPrepId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (insertErr) {
    if (insertErr.code === "23505") {
      return { status: 409, body: { error: "intent_exists" } };
    }
    return { status: 500, body: { error: "db_error" } };
  }

  return {
    status: 201,
    body: {
      effect_intent_id: (inserted as { id: string }).id,
      raw_amount: rawAmount,
      expires_at: expiresAt,
    },
  };
}

export function createLiveEventsApp(deps: LiveEventsDeps, secret: string): Hono {
  const app = new Hono();

  app.post("/live-events/effect-intents", async (c) => {
    const auth = c.req.header("authorization");
    if (auth !== `Bearer ${secret}`) {
      return c.json({ error: "unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }

    const result = await createEffectIntent(deps, body as EffectIntentInput);
    return c.json(result.body, result.status);
  });

  return app;
}
