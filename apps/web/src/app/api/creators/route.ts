import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@startip/shared/supabase/service";
import { rpc } from "@startip/shared/stellar/server";
import { contractId } from "@/lib/stellar/client";
import {
  normalizeHandle,
  handleHashHex,
  checkHandleAvailability,
} from "@/lib/creators/handle";

/**
 * POST /api/creators — claim a Handle (reserve it off-chain).
 *
 * Authed via the SSR server client. Validates the Handle, checks both the
 * `profiles` table (off-chain reservation) and the on-chain
 * `get_creator(sha256(handle))` registry, and on success stores `handle` +
 * `handle_hash = sha256(handle)` on the caller's Profile via the service role
 * (RLS forbids clients from writing these columns). Returns the Profile's
 * Creator fields.
 *
 * Rejects with 409 `handle_taken` when either source already holds the Handle,
 * and 409 `already_registered` when the caller is already an on-chain Creator
 * (the Handle is immutable after registration, ADR-0002).
 *
 * With `{ dryRun: true }` the route runs the same dual-source availability
 * check and returns 200 `{ available: true }` / 409 `{ error: "handle_taken",
 * reason }` without writing. The claim Handle form uses this for its live
 * availability indicator before the user submits.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const handle = typeof (body as { handle?: unknown })?.handle === "string"
    ? (body as { handle: string }).handle
    : "";
  const dryRun = (body as { dryRun?: unknown })?.dryRun === true;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const normalized = normalizeHandle(handle);
  if (!normalized.ok || !normalized.value) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }

  // Load the caller's profile.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id,user_id,handle,onchain_registered")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr) return NextResponse.json({ error: "db_error" }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });

  if (profile.onchain_registered) {
    return NextResponse.json({ error: "already_registered" }, { status: 409 });
  }

  // Dual-source availability check (off-chain profiles + on-chain get_creator).
  let availability;
  try {
    availability = await checkHandleAvailability({
      supabase,
      rpc,
      contractId,
      handle: normalized.value,
      excludeUserId: user.id,
    });
  } catch {
    return NextResponse.json({ error: "availability_check_failed" }, { status: 500 });
  }
  if (!availability.available) {
    return NextResponse.json(
      { error: "handle_taken", reason: availability.reason ?? "offchain_taken" },
      { status: 409 },
    );
  }

  // Availability-only mode: stop before the service-role write.
  if (dryRun) {
    return NextResponse.json({ available: true, handle: normalized.value });
  }

  const handleHashBytea = "\\x" + handleHashHex(normalized.value);
  const service = createServiceClient();
  const { error: updateErr } = await service
    .from("profiles")
    .update({ handle: normalized.value, handle_hash: handleHashBytea })
    .eq("user_id", user.id);
  if (updateErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json({
    handle: normalized.value,
    handle_hash: handleHashHex(normalized.value),
    owner_address: null,
    onchain_registered: false,
  });
}
