import * as StellarSdk from "@stellar/stellar-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyMessage } from "./moderation";

/**
 * `POST /verify` core logic, extracted so it can be tested as a pure function
 * of `(deps, input) -> { status, body }` without an HTTP context. The Hono
 * worker (`apps/worker/src/server.ts`) is a thin wrapper that polls this
 * function until the tx is visible or the poll window expires.
 *
 * Fetches the tx from RPC by `tx_hash`, verifies it succeeded, extracts the
 * `DonationReceived` event, extracts `donor_address` from the tx source
 * account, upserts by `tx_hash` as `confirmed`, and promotes an `indexed` row
 * to `confirmed` (ADR-0005: verify is the fast path, the indexer is the
 * reconcile path; both upsert by tx_hash).
 */

/** RPC surface the verify path depends on. */
export interface RpcLike {
  getTransaction(
    hash: string,
  ): Promise<StellarSdk.rpc.Api.GetTransactionResponse>;
}

export interface VerifyDeps {
  /** Service-role client (bypasses RLS). Reads donations/profiles, upserts. */
  service: SupabaseClient;
  rpc: RpcLike;
  /** DonationRouter contract id, used to scope event discovery. */
  contractId: string;
}

export interface VerifyInput {
  tx_hash: string;
  message?: string | null;
  donor_name?: string;
}

export interface VerifySuccessBody {
  status: "confirmed";
}

export interface VerifyPendingBody {
  status: "pending";
}

export interface VerifyErrorBody {
  error: string;
}

export interface VerifyResult {
  status: number;
  body: VerifySuccessBody | VerifyPendingBody | VerifyErrorBody;
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
  // The Soroban #[contractevent] macro emits the topic as a snake_case
  // Symbol (e.g. "donation_received"), not the PascalCase struct name.
  if (topic !== "donation_received") return null;
  return StellarSdk.scValToNative(v0.data()) as Record<string, unknown>;
}

/**
 * Verify + confirm a donation. Errors:
 *   400 `invalid_body`
 *   404 `tx_not_found`
 *   409 `tx_failed` / `donation_event_not_found` / `creator_not_found`
 *   500 `db_error` / `rpc_error`
 *
 * The caller (worker) is expected to poll this function on 404 until the poll
 * window expires, then return 202 to the client.
 */
export async function verifyDonation(
  deps: VerifyDeps,
  input: VerifyInput,
): Promise<VerifyResult> {
  const { service, rpc } = deps;
  const txHash = typeof input.tx_hash === "string" ? input.tx_hash.trim() : "";
  if (!txHash) {
    return { status: 400, body: { error: "invalid_body" } };
  }

  const message = input.message ?? null;
  const donorName = input.donor_name ?? null;

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

  // Extract donor_address from the tx source account.
  let donorAddress: string;
  try {
    donorAddress = extractSourceAddress(tx.envelopeXdr);
  } catch {
    return { status: 409, body: { error: "donation_event_not_found" } };
  }

  const handleHashBytea =
    "\\x" +
    Buffer.from(donationEvent.creator_id_hash as Uint8Array).toString("hex");
  const token = donationEvent.token as string;
  const amount = (donationEvent.amount as bigint).toString();

  // 1. Match an existing row by tx_hash (the sole natural key per ADR-0005).
  const { data: existing, error: selErr } = await service
    .from("donations")
    .select("id,status,message,donor_name")
    .eq("tx_hash", txHash)
    .maybeSingle();
  if (selErr) return { status: 500, body: { error: "db_error" } };
  const existingRow = existing as DonationRow | null;

  if (existingRow) {
    // Idempotent no-op on an already-confirmed row (ADR-0005).
    if (existingRow.status === "confirmed") {
      return { status: 200, body: { status: "confirmed" } };
    }

    // Promote indexed -> confirmed. Fill message/donor_name only when the
    // existing row still has the indexer defaults (NULL message /
    // "Anonymous" donor_name), so a verify that arrives after the indexer
    // enriches the row with the client-supplied content.
    const update: Record<string, unknown> = {
      status: "confirmed",
      donor_address: donorAddress,
      confirmed_at: nowIso(),
    };
    if (existingRow.message == null && message != null) {
      update.message = message;
    }
    if (
      (existingRow.donor_name == null || existingRow.donor_name === "Anonymous") &&
      donorName != null
    ) {
      update.donor_name = donorName;
    }
    // Re-run classifyMessage when we are enriching content, so a banned
    // keyword in the newly-arrived message/donor_name is caught.
    if (update.message != null || update.donor_name != null) {
      update.moderation_status = classifyMessage(
        (update.message as string | null) ?? existingRow.message,
        (update.donor_name as string | null) ?? existingRow.donor_name,
      );
    }

    const { error: updErr } = await service
      .from("donations")
      .update(update)
      .eq("id", existingRow.id);
    if (updErr) return { status: 500, body: { error: "db_error" } };
    return { status: 200, body: { status: "confirmed" } };
  }

  // 2. No existing row: the indexer has not seen it and no prior verify fired.
  //    Insert a fresh confirmed row with the client-supplied content. Requires
  //    the creator profile (matched by handle_hash).
  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("id")
    .eq("handle_hash", handleHashBytea)
    .maybeSingle();
  if (profileErr) return { status: 500, body: { error: "db_error" } };
  if (!profile) return { status: 409, body: { error: "creator_not_found" } };

  const { error: insErr } = await service.from("donations").insert({
    tx_hash: txHash,
    creator_profile_id: (profile as ProfileRow).id,
    handle_hash: handleHashBytea,
    token,
    amount,
    donor_name: donorName ?? "Anonymous",
    donor_address: donorAddress,
    status: "confirmed",
    message: message,
    moderation_status: classifyMessage(message, donorName ?? "Anonymous"),
    confirmed_at: nowIso(),
  });
  if (insErr) return { status: 500, body: { error: "db_error" } };
  return { status: 200, body: { status: "confirmed" } };
}
