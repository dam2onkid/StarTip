import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `POST /api/donations/prepare` core logic, extracted so it can be tested as a
 * pure function of `(deps, input) -> { status, body }` without a Next.js
 * request context. The route handler in `app/api/donations/prepare/route.ts`
 * is a thin wrapper that builds the deps and maps the result to a
 * `NextResponse`.
 *
 * The service client (service role, bypasses RLS) reads the creator Profile
 * and the `tokens` allowlist and inserts the pending `donations` row, since
 * clients have no INSERT policy on either table. The session client (SSR,
 * carries the user's JWT) is used only for `auth.getUser()` to detect a
 * logged-in Donor.
 */

export interface PrepareDeps {
  /** Service-role client (bypasses RLS). Reads profiles/tokens, inserts donations. */
  service: SupabaseClient;
  /** SSR client carrying the request cookies; used only for `auth.getUser()`. */
  session: SupabaseClient;
  /** DonationRouter contract id, returned to the client for tx building. */
  contractId: string;
}

export interface PrepareInput {
  handle: string;
  token: string;
  /** Raw i128 amount as a numeric string (the UI converts from display units). */
  amount: string;
  message?: string | null;
  donor_name?: string;
}

export interface TokenAllowlistEntry {
  contract_address: string;
  symbol: string;
  name: string | null;
  issuer: string | null;
  decimals: number;
  icon_url: string | null;
}

export interface PrepareSuccessBody {
  donation_id: string;
  /** sha256(donation_id::text) as lowercase hex (no `\x` prefix), for the client. */
  donation_id_hash: string;
  contract_id: string;
  /** sha256(handle) as lowercase hex (no `\x` prefix), for the client. */
  handle_hash: string;
  token_allowlist: TokenAllowlistEntry[];
}

export interface PrepareErrorBody {
  error: string;
  reason?: string;
}

export interface PrepareResult {
  status: number;
  body: PrepareSuccessBody | PrepareErrorBody;
}

interface CreatorProfileRow {
  id: string;
  handle: string;
  handle_hash: string;
  onchain_registered: boolean;
  paused: boolean;
}

interface DonorProfileRow {
  display_name: string;
}

/** sha256(text) as a `\x`-prefixed hex string (the bytea wire format). */
function sha256ByteaHex(text: string): string {
  return "\\x" + createHash("sha256").update(text, "utf8").digest("hex");
}

/** Lowercase hex without the `\x` prefix, for client consumption. */
function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Validate + insert a pending donation and return the metadata the client
 * needs to build the `donate(donor, handle_hash, token, amount,
 * donation_id_hash)` transaction.
 *
 * Errors:
 *   400 `invalid_body` / `invalid_amount` / `token_not_allowed`
 *   404 `creator_not_found`
 *   409 `creator_paused` / `creator_not_registered`
 *   500 `db_error`
 */
export async function prepareDonation(
  deps: PrepareDeps,
  input: PrepareInput,
): Promise<PrepareResult> {
  const { service, session, contractId } = deps;
  const handle = typeof input.handle === "string" ? input.handle.trim().toLowerCase() : "";
  const token = typeof input.token === "string" ? input.token : "";
  const amount = typeof input.amount === "string" ? input.amount.trim() : "";

  if (!handle || !token || !amount) {
    return { status: 400, body: { error: "invalid_body" } };
  }
  // amount is a numeric string representing a raw i128. Reject non-numeric,
  // negative, or zero values. BigInt handles arbitrary precision.
  let amountBig: bigint;
  try {
    amountBig = BigInt(amount);
  } catch {
    return { status: 400, body: { error: "invalid_amount" } };
  }
  if (amountBig <= BigInt(0)) {
    return { status: 400, body: { error: "invalid_amount" } };
  }

  // 1. Creator: registered + not paused.
  const { data: creator, error: creatorErr } = await service
    .from("profiles")
    .select("id,handle,handle_hash,onchain_registered,paused")
    .eq("handle", handle)
    .maybeSingle();
  if (creatorErr) return { status: 500, body: { error: "db_error" } };
  if (!creator) return { status: 404, body: { error: "creator_not_found" } };
  const c = creator as CreatorProfileRow;
  if (!c.onchain_registered) {
    return { status: 409, body: { error: "creator_not_registered" } };
  }
  if (c.paused) return { status: 409, body: { error: "creator_paused" } };

  // 2. Token allowlist (read the full list so the response can carry it).
  const { data: tokens, error: tokensErr } = await service
    .from("tokens")
    .select("contract_address,symbol,name,issuer,decimals,icon_url");
  if (tokensErr) return { status: 500, body: { error: "db_error" } };
  const allowlist = (tokens ?? []) as TokenAllowlistEntry[];
  if (!allowlist.some((t) => t.contract_address === token)) {
    return { status: 400, body: { error: "token_not_allowed" } };
  }

  // 3. Session + donor_name resolution.
  let userId: string | null = null;
  let donorName = (typeof input.donor_name === "string" && input.donor_name.trim())
    ? input.donor_name.trim()
    : "Anonymous";
  const {
    data: { user },
  } = await session.auth.getUser();
  if (user) {
    userId = user.id;
    const { data: donorProfile } = await service
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const dn = (donorProfile as DonorProfileRow | null)?.display_name;
    if (dn && dn !== "Anonymous") donorName = dn;
  }

  // 4. Insert the pending row. id + donation_id_hash are minted here so the
  //    hash is sha256(id::text) exactly, matching what the confirm path will
  //    recompute from the donation_id the client posts back.
  const id = randomUUID();
  const donationIdHashBytea = sha256ByteaHex(id);
  const handleHashBytea = c.handle_hash ?? sha256ByteaHex(handle);

  const insertPayload = {
    id,
    donation_id_hash: donationIdHashBytea,
    creator_profile_id: c.id,
    handle_hash: handleHashBytea,
    token,
    amount,
    message: input.message ?? null,
    donor_name: donorName,
    user_id: userId,
    status: "pending",
  };
  const { error: insertErr } = await service
    .from("donations")
    .insert(insertPayload);
  if (insertErr) return { status: 500, body: { error: "db_error" } };

  // 5. Respond. handle_hash is derived from the stored bytea (strip `\x`); if
  //    the profile row lacked it, fall back to sha256(handle).
  const handleHashHex = c.handle_hash
    ? c.handle_hash.replace(/^\\x/, "")
    : sha256Hex(handle);

  return {
    status: 200,
    body: {
      donation_id: id,
      donation_id_hash: donationIdHashBytea.slice(2),
      contract_id: contractId,
      handle_hash: handleHashHex,
      token_allowlist: allowlist,
    },
  };
}
