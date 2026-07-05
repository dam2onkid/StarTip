import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@startip/shared/supabase/service";
import {
  DEFAULT_ALERT_DURATION_MS,
  MIN_ALERT_DURATION_MS,
  MAX_ALERT_DURATION_MS,
} from "@/lib/overlay/settings";

/**
 * `/api/overlay-settings` — public read and authed owner write of a
 * Creator's Overlay settings (spec §11.3).
 *
 * GET `?handle=<handle>` — public. Resolves the handle to a registered,
 * not-paused Creator profile (service role, bypasses RLS), reads the
 * `overlay_settings` row by `creator_profile_id`, and returns it. When no
 * row exists, returns the column defaults (6000ms, 0, true, 'default') so
 * the Overlay works out of the box before the Creator configures it.
 *
 * PUT (authed) — upserts the caller's row. Body:
 * `{ alert_duration_ms, min_amount, sound_enabled }`. Validates
 * `alert_duration_ms` (1000-60000), `min_amount` (>= 0), `sound_enabled`
 * (boolean). The upsert goes through the SSR server client (carrying the
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
} as const;

export async function GET(request: NextRequest) {
  const handleParam = request.nextUrl.searchParams.get("handle");
  const handle = typeof handleParam === "string" ? handleParam.trim().toLowerCase() : "";
  if (!handle) {
    return NextResponse.json({ error: "missing_handle" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("id,onchain_registered,paused")
    .eq("handle", handle)
    .maybeSingle();
  if (profileErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
  const p = profile as { id: string; onchain_registered: boolean; paused: boolean } | null;
  if (!p || !p.onchain_registered || p.paused) {
    return NextResponse.json({ error: "creator_not_found" }, { status: 404 });
  }

  const { data: row, error: rowErr } = await service
    .from("overlay_settings")
    .select("alert_duration_ms,min_amount,sound_enabled,theme")
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

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id,user_id,handle")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
  const p = profile as { id: string; user_id: string; handle: string | null } | null;
  if (!p) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  if (!p.handle) return NextResponse.json({ error: "not_creator" }, { status: 400 });

  // Upsert through the session client so the owner-write RLS policies apply.
  // The unique index on creator_profile_id makes this converge to one row.
  const payload = {
    creator_profile_id: p.id,
    alert_duration_ms: alertDurationMs,
    min_amount: minAmount,
    sound_enabled: soundEnabled,
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
    },
    { status: 200 },
  );
}
