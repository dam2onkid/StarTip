import { NextResponse, type NextRequest } from "next/server";
import { requireAuthedCreator } from "@/lib/auth/context";
import { createServiceClient } from "@startip/shared/supabase/service";
import { getLiveEventsPublicConfig } from "@/lib/live-events/public-config";
import {
  DEFAULT_EFFECT_IDS,
  parsePriceInput,
  validateEffectPrice,
} from "@startip/shared/live-events/pricing";

/**
 * `/api/creators/[handle]/live-events` - public read and authed owner write of
 * a Creator's Live Events opt-in and Default Pack Effect Prices.
 *
 * GET - public. Delegates to `getLiveEventsPublicConfig` so the same logic can
 * be reused by the donate page server component.
 *
 * PUT (authed owner) - upserts the caller's row. Body:
 * `{ live_events_enabled, prices: { 'screen-flash': number, ... } }`. Validates
 * `live_events_enabled` (boolean) and each price (finite, >= 0.10 test USDC).
 * The upsert goes through the SSR server client so the owner RLS policies
 * enforce non-owner rejection.
 */

export async function GET(_request: NextRequest, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const service = createServiceClient();
  const result = await getLiveEventsPublicConfig({ service }, handle);
  return NextResponse.json(result.body, { status: result.status });
}

interface PutBody {
  live_events_enabled?: unknown;
  prices?: unknown;
}

function isValidPrices(prices: unknown): prices is Record<string, unknown> {
  return typeof prices === "object" && prices !== null && !Array.isArray(prices);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const normalized = handle.trim().toLowerCase();
  if (!normalized) {
    return NextResponse.json({ error: "missing_handle" }, { status: 400 });
  }

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (typeof body.live_events_enabled !== "boolean") {
    return NextResponse.json({ error: "invalid_live_events_enabled" }, { status: 400 });
  }
  if (!isValidPrices(body.prices)) {
    return NextResponse.json({ error: "invalid_prices" }, { status: 400 });
  }

  const parsedPrices: Record<string, number> = {};
  for (const id of DEFAULT_EFFECT_IDS) {
    const value = (body.prices as Record<string, unknown>)[id] as
      | string
      | number
      | null
      | undefined;
    const parsed = parsePriceInput(value);
    if (parsed === null) {
      return NextResponse.json({ error: "invalid_price" }, { status: 400 });
    }
    const valid = validateEffectPrice(parsed);
    if (!valid.ok) {
      return NextResponse.json({ error: valid.error }, { status: 400 });
    }
    parsedPrices[id] = parsed;
  }

  const auth = await requireAuthedCreator(normalized);
  if (!auth.ok) return auth.response;
  const { supabase, profile } = auth.context;

  const payload = {
    creator_profile_id: profile.id,
    live_events_enabled: body.live_events_enabled,
    screen_flash_price: parsedPrices["screen-flash"],
    jump_scare_price: parsedPrices["jump-scare"],
    tunnel_vision_price: parsedPrices["tunnel-vision"],
    screen_cover_price: parsedPrices["screen-cover"],
  };
  const { error: upsertErr } = await supabase
    .from("live_event_settings")
    .upsert(payload, { onConflict: "creator_profile_id" });
  if (upsertErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json(
    {
      live_events_enabled: body.live_events_enabled,
      prices: parsedPrices,
    },
    { status: 200 },
  );
}
