import { NextResponse, type NextRequest } from "next/server";
import { requireAuthedCreator } from "@/lib/auth/context";
import { createServiceClient } from "@startip/shared/supabase/service";

/**
 * `/api/creators/[handle]/goal` - public read and authed owner write of a
 * Creator's donation goal (spec §6.2, PRD "Donation goal").
 *
 * GET - public. Resolves the handle to a registered, not-paused Creator
 * profile (service role, bypasses RLS), reads the `donation_goals` row by
 * `creator_profile_id`, and returns `{ target_amount, token }` or `null` when
 * no row exists (no goal displayed). `target_amount` is the raw numeric
 * string stored on the row.
 *
 * PUT (authed owner) - upserts the caller's row. Body:
 * `{ target_amount, token }`. Validates `target_amount` (>= 0, numeric) and
 * `token` (non-empty, in the `tokens` allowlist). The upsert goes through the
 * SSR server client (carrying the caller's JWT) so the
 * `donation_goals_owner_insert` / `donation_goals_owner_update` RLS policies
 * enforce owner-only writes. `target_amount = 0` deletes the row (clears the
 * goal) via the `donation_goals_owner_delete` policy. The path `[handle]`
 * must match the caller's own handle; a mismatch is a 403 `forbidden`.
 */

export async function GET(_request: NextRequest, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const normalized = handle.trim().toLowerCase();
  if (!normalized) {
    return NextResponse.json({ error: "missing_handle" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("id,onchain_registered,paused")
    .eq("handle", normalized)
    .maybeSingle();
  if (profileErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
  const p = profile as { id: string; onchain_registered: boolean; paused: boolean } | null;
  if (!p || !p.onchain_registered || p.paused) {
    return NextResponse.json({ error: "creator_not_found" }, { status: 404 });
  }

  const { data: row, error: rowErr } = await service
    .from("donation_goals")
    .select("target_amount,token")
    .eq("creator_profile_id", p.id)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
  if (!row) return NextResponse.json(null, { status: 200 });
  const g = row as { target_amount: string; token: string };
  return NextResponse.json({ target_amount: g.target_amount, token: g.token }, { status: 200 });
}

interface PutBody {
  target_amount?: unknown;
  token?: unknown;
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

  const targetAmount = body.target_amount;
  const token = body.token;

  // Validate target_amount: a finite number >= 0 (number or numeric string).
  if (
    (typeof targetAmount !== "number" && typeof targetAmount !== "string") ||
    !Number.isFinite(Number(targetAmount)) ||
    Number(targetAmount) < 0
  ) {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }
  // Validate token: a non-empty string.
  if (typeof token !== "string" || token.trim().length === 0) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const auth = await requireAuthedCreator(normalized);
  if (!auth.ok) return auth.response;
  const { supabase, profile } = auth.context;

  const targetNum = Number(targetAmount);

  // Clear the goal: target_amount = 0 deletes the row.
  if (targetNum === 0) {
    const { error: delErr } = await supabase
      .from("donation_goals")
      .delete()
      .eq("creator_profile_id", profile.id);
    if (delErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
    return NextResponse.json({ target_amount: 0, token }, { status: 200 });
  }

  // Upsert path: the token must be in the allowlist.
  const service = createServiceClient();
  const { data: tokens, error: tokensErr } = await service
    .from("tokens")
    .select("contract_address");
  if (tokensErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
  const allowlist = (tokens ?? []) as { contract_address: string }[];
  if (!allowlist.some((t) => t.contract_address === token)) {
    return NextResponse.json({ error: "token_not_allowed" }, { status: 400 });
  }

  const payload = {
    creator_profile_id: profile.id,
    target_amount: targetAmount,
    token,
  };
  const { error: upsertErr } = await supabase
    .from("donation_goals")
    .upsert(payload, { onConflict: "creator_profile_id" });
  if (upsertErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json({ target_amount: targetAmount, token }, { status: 200 });
}
