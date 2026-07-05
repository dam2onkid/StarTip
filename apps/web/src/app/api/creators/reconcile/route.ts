import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rpc } from "@/lib/stellar/server";
import { contractId } from "@/lib/stellar/client";
import { readCreatorOnChain } from "@/lib/creators/handle";

/**
 * POST /api/creators/reconcile — recover a Creator whose on-chain
 * `register_creator` succeeded but whose `CreatorRegistered` event was never
 * mirrored by the indexer (e.g. the event was emitted before the indexer's
 * first poll, so the bootstrap skipped it, or the indexer was not running).
 *
 * Reads the authoritative on-chain `get_creator(sha256(handle))` and, when the
 * entry exists and its `owner` matches the caller's linked `owner_address`,
 * flips `onchain_registered = true` and stores the `payout_address`. This is
 * the deterministic recovery path that does not depend on event history.
 *
 * Returns:
 *   200 { onchain_registered: true, payout_address }  — flipped (or already was)
 *   200 { onchain_registered: false }                 — not registered yet
 *   409 { error: "owner_mismatch" }                   — registered to another wallet
 *   409 { error: "not_ready" }                        — no handle / wallet linked yet
 */
export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id,user_id,handle,owner_address,onchain_registered")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });

  if (profile.onchain_registered) {
    return NextResponse.json({ onchain_registered: true });
  }

  if (!profile.handle || !profile.owner_address) {
    return NextResponse.json({ error: "not_ready" }, { status: 409 });
  }

  let creator;
  try {
    creator = await readCreatorOnChain({
      rpc,
      contractId,
      handle: profile.handle,
    });
  } catch {
    return NextResponse.json({ error: "onchain_read_failed" }, { status: 500 });
  }

  if (!creator) {
    return NextResponse.json({ onchain_registered: false });
  }

  if (creator.owner !== profile.owner_address) {
    return NextResponse.json({ error: "owner_mismatch" }, { status: 409 });
  }

  const service = createServiceClient();
  const { error: updateErr } = await service
    .from("profiles")
    .update({
      onchain_registered: true,
      onchain_registered_at: new Date().toISOString(),
      payout_address: creator.payout_address,
    })
    .eq("user_id", user.id);
  if (updateErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json({
    onchain_registered: true,
    payout_address: creator.payout_address,
  });
}
