import { NextResponse, type NextRequest } from "next/server";
import * as StellarSdk from "@stellar/stellar-sdk";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@startip/shared/supabase/service";
import { handleHashHex } from "@/lib/creators/handle";

interface LinkBody {
  address?: unknown;
  signedMessage?: unknown;
  signerAddress?: unknown;
}

/**
 * POST /api/wallet/link — verify a `signMessage` signature and link the wallet.
 *
 * Authed. Body `{ address, signedMessage, signerAddress? }`. Reconstructs the
 * challenge from the caller's Profile (handle + handle_hash + stored nonce),
 * applies the SEP-53 prehash (`SHA256("Stellar Signed Message:\n" || challenge)`)
 * and verifies `Keypair.fromPublicKey(address).verify(prehash, sig)` (Ed25519
 * detached verify), checks the nonce has not expired, and
 * enforces re-link-only-pre-registration. On success writes `owner_address`
 * and nulls the nonce + expiry (service role).
 *
 * - 400 `invalid_body` / `invalid_address` / `no_handle` / `nonce_missing` /
 *   `nonce_expired` / `invalid_signature` / `signer_mismatch`
 * - 409 `already_linked` when linked AND `onchain_registered = true`
 * - 200 `{ owner_address }` on success
 */
export async function POST(request: NextRequest) {
  let body: LinkBody;
  try {
    body = (await request.json()) as LinkBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const address = typeof body.address === "string" ? body.address : "";
  const signedMessage = typeof body.signedMessage === "string" ? body.signedMessage : "";
  const signerAddress = typeof body.signerAddress === "string" ? body.signerAddress : undefined;
  if (!address || !signedMessage) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id,user_id,handle,handle_hash,owner_address,onchain_registered,wallet_link_nonce,wallet_link_nonce_expires_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });

  if (!profile.handle) {
    return NextResponse.json({ error: "no_handle" }, { status: 400 });
  }
  if (profile.owner_address && profile.onchain_registered) {
    return NextResponse.json({ error: "already_linked" }, { status: 409 });
  }
  if (signerAddress !== undefined && signerAddress !== address) {
    return NextResponse.json({ error: "signer_mismatch" }, { status: 400 });
  }
  if (!profile.wallet_link_nonce) {
    return NextResponse.json({ error: "nonce_missing" }, { status: 400 });
  }
  const expiresAt = profile.wallet_link_nonce_expires_at
    ? new Date(profile.wallet_link_nonce_expires_at).getTime()
    : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return NextResponse.json({ error: "nonce_expired" }, { status: 400 });
  }

  // Reconstruct the exact challenge the challenge endpoint produced.
  const handleHash = handleHashHex(profile.handle);
  const challenge =
    `StarTip wallet link\n` +
    `Handle: ${profile.handle}\n` +
    `Profile: ${handleHash}\n` +
    `Nonce: ${profile.wallet_link_nonce}`;

  let keypair: StellarSdk.Keypair;
  try {
    keypair = StellarSdk.Keypair.fromPublicKey(address);
  } catch {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  // Freighter (and any SEP-53 wallet) does not sign the raw challenge bytes.
  // It signs SHA256("Stellar Signed Message:\n" || message). Keypair.verify is
  // raw ed25519, so we must apply the SEP-53 prehash ourselves before verifying.
  const sep53Prehash = StellarSdk.hash(
    Buffer.concat([
      Buffer.from("Stellar Signed Message:\n"),
      Buffer.from(challenge, "utf8"),
    ]),
  );
  let valid = false;
  try {
    valid = keypair.verify(sep53Prehash, Buffer.from(signedMessage, "hex"));
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error: updateErr } = await service
    .from("profiles")
    .update({
      owner_address: address,
      wallet_link_nonce: null,
      wallet_link_nonce_expires_at: null,
    })
    .eq("user_id", user.id);
  if (updateErr) return NextResponse.json({ error: "db_error" }, { status: 500 });

  return NextResponse.json({ owner_address: address });
}
