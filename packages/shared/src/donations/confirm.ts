import * as StellarSdk from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyMessage } from "./moderation";

/**
 * `POST /api/donations/confirm` core logic, extracted so it can be tested as a
 * pure function of `(deps, input) -> { status, body }` without a Next.js
 * request context. The route handler in `app/api/donations/confirm/route.ts`
 * is a thin wrapper.
 *
 * Fetches the tx from RPC by `tx_hash`, verifies it succeeded, extracts the
 * `DonationReceived` event, checks `event.donation_id_hash == sha256(donation_id)`,
 * extracts `donor_address` from the tx source account, upserts by `tx_hash` as
 * `confirmed`, and promotes an `indexed` row to `confirmed` (ADR-0003: confirm
 * is the fast path, the indexer is the reconcile path; both upsert by tx_hash).
 */

/** RPC surface the confirm path depends on. */
export interface RpcLike {
  getTransaction(
    hash: string,
  ): Promise<StellarSdk.rpc.Api.GetTransactionResponse>;
}

export interface ConfirmDeps {
  /** Service-role client (bypasses RLS). Reads donations/profiles, upserts. */
  service: SupabaseClient;
  rpc: RpcLike;
  /** DonationRouter contract id, used to scope event discovery. */
  contractId: string;
}

export interface ConfirmInput {
  tx_hash: string;
  donation_id: string;
}

export interface ConfirmSuccessBody {
  status: "confirmed";
}

export interface ConfirmErrorBody {
  error: string;
}

export interface ConfirmResult {
  status: number;
  body: ConfirmSuccessBody | ConfirmErrorBody;
}

interface DonationRow {
  id: string;
  status: string;
  message?: string | null;
  donor_name?: string | null;
}

interface ProfileRow {
  id: string;
}

/** sha256(text) as a `\x`-prefixed hex string (the bytea wire format). */
function sha256ByteaHex(text: string): string {
  return "\\x" + createHash("sha256").update(text, "utf8").digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Extract the source account (G...) from a transaction envelope. Handles V0,
 * V1, and fee-bump envelopes (drilling into the inner tx for fee-bump). The
 * donate tx is signed by the donor as the source, so this is the donor's
 * address.
 */
export function extractSourceAddress(env: StellarSdk.xdr.TransactionEnvelope): string {
  switch (env.switch().name) {
    case "envelopeTypeTxV0": {
      const ed = env.v0().tx().sourceAccountEd25519();
      return StellarSdk.StrKey.encodeEd25519PublicKey(ed);
    }
    case "envelopeTypeTx": {
      const muxed = env.v1().tx().sourceAccount();
      return StellarSdk.StrKey.encodeEd25519PublicKey(muxed.ed25519());
    }
    case "envelopeTypeTxFeeBump": {
      // The donor is the inner tx's source, not the fee source.
      const inner = env.feeBump().tx().innerTx().v1();
      const muxed = inner.tx().sourceAccount();
      return StellarSdk.StrKey.encodeEd25519PublicKey(muxed.ed25519());
    }
    default:
      throw new Error(`unsupported transaction envelope type: ${env.switch().name}`);
  }
}

/** Decode a `DonationReceived` contract event into its native field map. */
export function decodeDonationReceivedEvent(
  event: StellarSdk.xdr.ContractEvent,
): Record<string, unknown> | null {
  const body = event.body();
  if (body.switch() !== 0) return null;
  const v0 = body.v0();
  const topics = v0.topics();
  if (!topics || topics.length === 0) return null;
  const topic = StellarSdk.scValToNative(topics[0]);
  if (topic !== "DonationReceived") return null;
  return StellarSdk.scValToNative(v0.data()) as Record<string, unknown>;
}

/**
 * Verify + confirm a donation. Errors:
 *   400 `invalid_body`
 *   404 `tx_not_found`
 *   409 `tx_failed` / `donation_event_not_found` / `donation_id_hash_mismatch`
 *        / `creator_not_found`
 *   500 `db_error` / `rpc_error`
 */
export async function confirmDonation(
  deps: ConfirmDeps,
  input: ConfirmInput,
): Promise<ConfirmResult> {
  const { service, rpc } = deps;
  const txHash = typeof input.tx_hash === "string" ? input.tx_hash.trim() : "";
  const donationId = typeof input.donation_id === "string" ? input.donation_id.trim() : "";
  if (!txHash || !donationId) {
    return { status: 400, body: { error: "invalid_body" } };
  }

  let tx: StellarSdk.rpc.Api.GetTransactionResponse;
  try {
    tx = await rpc.getTransaction(txHash);
  } catch {
    return { status: 500, body: { error: "rpc_error" } };
  }

  if (tx.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND) {
    return { status: 404, body: { error: "tx_not_found" } };
  }
  if (tx.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
    return { status: 409, body: { error: "tx_failed" } };
  }

  // SUCCESS: find the DonationReceived event in the contract events.
  const contractEvents = tx.events?.contractEventsXdr ?? [];
  let donationEvent: Record<string, unknown> | null = null;
  for (const group of contractEvents) {
    for (const evt of group) {
      const decoded = decodeDonationReceivedEvent(evt);
      if (decoded) {
        donationEvent = decoded;
        break;
      }
    }
    if (donationEvent) break;
  }
  if (!donationEvent) {
    return { status: 409, body: { error: "donation_event_not_found" } };
  }

  // Verify event.donation_id_hash == sha256(donation_id).
  const eventHashBuf = Buffer.from(donationEvent.donation_id_hash as Uint8Array);
  const expectedHash = createHash("sha256").update(donationId, "utf8").digest();
  if (!eventHashBuf.equals(expectedHash)) {
    return { status: 409, body: { error: "donation_id_hash_mismatch" } };
  }

  // Extract donor_address from the tx source account.
  let donorAddress: string;
  try {
    donorAddress = extractSourceAddress(tx.envelopeXdr);
  } catch {
    return { status: 409, body: { error: "donation_event_not_found" } };
  }

  const donationIdHashBytea = sha256ByteaHex(donationId);
  const handleHashBytea =
    "\\x" +
    Buffer.from(donationEvent.creator_id_hash as Uint8Array).toString("hex");
  const token = donationEvent.token as string;
  const amount = (donationEvent.amount as bigint).toString();

  // 1. Match the pending/confirmed row by donation_id_hash.
  const { data: existing, error: selErr } = await service
    .from("donations")
    .select("id,status,message,donor_name")
    .eq("donation_id_hash", donationIdHashBytea)
    .maybeSingle();
  if (selErr) return { status: 500, body: { error: "db_error" } };
  const existingRow = existing as DonationRow | null;

  if (existingRow) {
    // Promote to confirmed (covers pending -> confirmed AND indexed -> confirmed).
    // Re-run classifyMessage only when the row is still `pending`, so a
    // prepare-time `auto_hidden` is not overwritten. For an `indexed` row the
    // indexer already set moderation_status and we preserve it.
    const update: Record<string, unknown> = {
      status: "confirmed",
      tx_hash: txHash,
      donor_address: donorAddress,
      confirmed_at: nowIso(),
    };
    if (existingRow.status === "pending") {
      update.moderation_status = classifyMessage(
        existingRow.message,
        existingRow.donor_name,
      );
    }
    const { error: updErr } = await service
      .from("donations")
      .update(update)
      .eq("id", existingRow.id);
    if (updErr) return { status: 500, body: { error: "db_error" } };
    return { status: 200, body: { status: "confirmed" } };
  }

  // 2. No existing row: the indexer has not seen it and prepare either was not
  //    called or the row was removed. Insert a fresh confirmed row. Requires
  //    the creator profile (matched by handle_hash).
  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("id")
    .eq("handle_hash", handleHashBytea)
    .maybeSingle();
  if (profileErr) return { status: 500, body: { error: "db_error" } };
  if (!profile) return { status: 409, body: { error: "creator_not_found" } };

  const { error: insErr } = await service.from("donations").insert({
    donation_id_hash: donationIdHashBytea,
    tx_hash: txHash,
    creator_profile_id: (profile as ProfileRow).id,
    handle_hash: handleHashBytea,
    token,
    amount,
    donor_name: "Anonymous",
    donor_address: donorAddress,
    status: "confirmed",
    // No message is available from the on-chain event, so classifyMessage
    // sees (null, "Anonymous") and returns 'visible'.
    moderation_status: classifyMessage(null, "Anonymous"),
    confirmed_at: nowIso(),
  });
  if (insErr) return { status: 500, body: { error: "db_error" } };
  return { status: 200, body: { status: "confirmed" } };
}
