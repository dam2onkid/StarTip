import { NextResponse, type NextRequest } from "next/server";
import { requireAuthedCreator } from "@/lib/auth/context";
import { createServiceClient } from "@startip/shared/supabase/service";
import { env } from "@/lib/env";
import {
  DEFAULT_ALERT_DURATION_MS,
  MIN_ALERT_DURATION_MS,
  MAX_ALERT_DURATION_MS,
} from "@/lib/overlay/settings";

/**
 * `/api/overlay-settings` - public read and authed owner write of a
 * Creator's Overlay settings (spec §11.3).
 *
 * GET `?overlay_id=<overlay_id>` - public. Resolves the opaque Overlay ID to a
 * registered, not-paused Creator profile (service role, bypasses RLS), reads
 * the `overlay_settings` row by `creator_profile_id`, and returns it. When no
 * row exists, returns the column defaults (10000ms, 0, true, 'default', false,
 * null) so the Overlay works out of the box before the Creator configures it.
 *
 * PUT (authed) - upserts the caller's row. Body:
 * `{ alert_duration_ms, min_amount, sound_enabled, tts_enabled, tts_voice }`.
 * Validates `alert_duration_ms` (1000-60000), `min_amount` (>= 0),
 * `sound_enabled` (boolean), `tts_enabled` (boolean), and `tts_voice`
 * (non-empty string, which must be a Voice currently supported by the Worker,
 * or null). The upsert goes through the SSR server client (carrying the
 * caller's JWT) so the `overlay_settings_owner_insert` /
 * `overlay_settings_owner_update` RLS policies enforce owner-only writes: a
 * non-owner PUT is rejected by RLS and surfaces as a 500 `db_error`. The
 * unique index on `creator_profile_id` makes the upsert converge to a single
 * row per Creator.
 */

const DEFAULTS = {
  alert_duration_ms: DEFAULT_ALERT_DURATION_MS,
  min_amount: "0",
  sound_enabled: true,
  theme: "default",
  tts_enabled: false,
  tts_voice: null,
} as const;

export async function GET(request: NextRequest) {
  const overlayIdParam = request.nextUrl.searchParams.get("overlay_id");
  const overlayId = typeof overlayIdParam === "string" ? overlayIdParam.trim() : "";
  if (!overlayId) {
    return NextResponse.json({ error: "missing_overlay_id" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("id,onchain_registered,paused")
    .eq("overlay_id", overlayId)
    .maybeSingle();
  if (profileErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
  const p = profile as { id: string; onchain_registered: boolean; paused: boolean } | null;
  if (!p || !p.onchain_registered || p.paused) {
    return NextResponse.json({ error: "creator_not_found" }, { status: 404 });
  }

  const { data: row, error: rowErr } = await service
    .from("overlay_settings")
    .select("alert_duration_ms,min_amount,sound_enabled,theme,tts_enabled,tts_voice")
    .eq("creator_profile_id", p.id)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
  if (!row) {
    return NextResponse.json(DEFAULTS, { status: 200 });
  }
  return NextResponse.json(row, { status: 200 });
}

interface PutBody {
  alert_duration_ms?: unknown;
  min_amount?: unknown;
  sound_enabled?: unknown;
  tts_enabled?: unknown;
  tts_voice?: unknown;
}

async function isKnownTtsVoice(voice: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const workerRes = await fetch(`${env.WORKER_URL}/tts/voices`, {
      headers: {
        authorization: `Bearer ${env.WORKER_SECRET}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!workerRes.ok) return false;
    const body = (await workerRes.json()) as { voices?: Array<{ id: string }> };
    const voices = Array.isArray(body?.voices) ? body.voices : [];
    return voices.some((v) => v.id === voice);
  } catch {
    return false;
  }
}

export async function PUT(request: NextRequest) {
  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const alertDurationMs = body.alert_duration_ms;
  const minAmount = body.min_amount;
  const soundEnabled = body.sound_enabled;
  const ttsEnabled = body.tts_enabled;
  const ttsVoice = body.tts_voice;

  if (
    typeof alertDurationMs !== "number" ||
    !Number.isFinite(alertDurationMs) ||
    alertDurationMs < MIN_ALERT_DURATION_MS ||
    alertDurationMs > MAX_ALERT_DURATION_MS
  ) {
    return NextResponse.json({ error: "invalid_alert_duration" }, { status: 400 });
  }
  if (
    (typeof minAmount !== "number" && typeof minAmount !== "string") ||
    !Number.isFinite(Number(minAmount)) ||
    Number(minAmount) < 0
  ) {
    return NextResponse.json({ error: "invalid_min_amount" }, { status: 400 });
  }
  if (typeof soundEnabled !== "boolean") {
    return NextResponse.json({ error: "invalid_sound_enabled" }, { status: 400 });
  }
  if (typeof ttsEnabled !== "boolean") {
    return NextResponse.json({ error: "invalid_tts_enabled" }, { status: 400 });
  }
  if (!("tts_voice" in body) || (ttsVoice !== null && typeof ttsVoice !== "string")) {
    return NextResponse.json({ error: "invalid_tts_voice" }, { status: 400 });
  }

  let normalizedTtsVoice: string | null = null;
  if (typeof ttsVoice === "string") {
    const trimmed = ttsVoice.trim();
    normalizedTtsVoice = trimmed || null;
  }

  if (normalizedTtsVoice !== null && !(await isKnownTtsVoice(normalizedTtsVoice))) {
    return NextResponse.json({ error: "invalid_tts_voice" }, { status: 400 });
  }

  const auth = await requireAuthedCreator();
  if (!auth.ok) return auth.response;
  const { supabase, profile } = auth.context;

  // Upsert through the session client so the owner-write RLS policies apply.
  // The unique index on creator_profile_id makes this converge to one row.
  const payload = {
    creator_profile_id: profile.id,
    alert_duration_ms: alertDurationMs,
    min_amount: minAmount,
    sound_enabled: soundEnabled,
    tts_enabled: ttsEnabled,
    tts_voice: normalizedTtsVoice,
  };
  const { error: upsertErr } = await supabase
    .from("overlay_settings")
    .upsert(payload, { onConflict: "creator_profile_id" });
  if (upsertErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json(
    {
      alert_duration_ms: alertDurationMs,
      min_amount: minAmount,
      sound_enabled: soundEnabled,
      tts_enabled: ttsEnabled,
      tts_voice: normalizedTtsVoice,
    },
    { status: 200 },
  );
}
