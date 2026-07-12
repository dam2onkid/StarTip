import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAuthedProfile } from "@/lib/auth/context";
import { createServiceClient } from "@startip/shared/supabase/service";
import { handleHashHex } from "@/lib/creators/handle";

/** Nonce lifetime: the challenge must be signed within this window. */
const NONCE_TTL_MS = 10 * 60 * 1000;

/**
 * POST /api/wallet/link/challenge - generate a fresh wallet-link challenge.
 *
 * Authed. Loads the caller's Profile. If a wallet is already linked
 * (`owner_address` set) AND the Creator is registered on-chain, returns 409
 * `already_linked`: the on-chain owner is immutable after registration
 * (ADR-0002), so re-link is blocked. While `onchain_registered = false`,
 * re-link is allowed. Generates a 32-byte random nonce (hex), stores it on the
 * Profile with a 10-minute expiry (service role), and returns the
 * human-readable challenge string the wallet will sign with `signMessage`.
 */
export async function POST() {
  const auth = await requireAuthedProfile();
  if (!auth.ok) return auth.response;
  const { user, profile } = auth.context;

  if (!profile.handle) {
    return NextResponse.json({ error: "no_handle" }, { status: 400 });
  }

  if (profile.owner_address && profile.onchain_registered) {
    return NextResponse.json({ error: "already_linked" }, { status: 409 });
  }

  const nonceHex = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();

  const service = createServiceClient();
  const { error: updateErr } = await service
    .from("profiles")
    .update({
      wallet_link_nonce: nonceHex,
      wallet_link_nonce_expires_at: expiresAt,
    })
    .eq("user_id", user.id);
  if (updateErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  // handle_hash is recomputed from the handle so the challenge is deterministic
  // regardless of how the bytea column is encoded over the wire.
  const handleHash = handleHashHex(profile.handle);
  const challenge =
    `StarTip wallet link\n` +
    `Handle: ${profile.handle}\n` +
    `Profile: ${handleHash}\n` +
    `Nonce: ${nonceHex}`;

  return NextResponse.json({ challenge });
}
