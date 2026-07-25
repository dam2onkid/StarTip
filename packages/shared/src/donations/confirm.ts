import * as StellarSdk from "@stellar/stellar-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyMessage } from "./moderation";
import { toByteaHex } from "../bytea";
import { createOrdinaryLiveEvent, createEffectLiveEvent } from "../live-events/deliver";

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
  /** Supabase auth user id of the logged-in donor, if any. Anonymous donors omit this. */
  user_id?: string;
  /**
   * Donation preparation identity returned by the prepare step. Optional and
   * ignored for ordinary donations; it binds an on-chain settlement to a
   * previously-created Effect Intent for Live Events.
   */
  donation_prep_id?: string;
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
  user_id?: string | null;
  creator_profile_id?: string | null;
}

interface ProfileRow {
  id: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Live Events that do not start within 30 seconds expire (PRD). */
const LIVE_EVENT_EXPIRY_MS = 30_000;

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
  const userId = input.user_id?.trim() || undefined;

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

  const handleHashBytea = toByteaHex(donationEvent.creator_id_hash as Uint8Array);
  const token = donationEvent.token as string;
  const amount = (donationEvent.amount as bigint).toString();

  // 1. Match an existing row by tx_hash (the sole natural key per ADR-0005).
  const { data: existing, error: selErr } = await service
    .from("donations")
    .select("id,status,message,donor_name,user_id,creator_profile_id")
    .eq("tx_hash", txHash)
    .maybeSingle();
  if (selErr) return { status: 500, body: { error: "db_error" } };
  const existingRow = existing as DonationRow | null;

  let donationId: string;
  let creatorProfileId: string;

  if (existingRow) {
    creatorProfileId = existingRow.creator_profile_id!;

    // Idempotent no-op on an already-confirmed row (ADR-0005), but still
    // ensure a Live Event exists for ordinary Donations.
    if (existingRow.status === "confirmed") {
      donationId = existingRow.id;
      return deliverLiveEventIfNeeded(service, input, {
        donationId,
        creatorProfileId,
        txHash,
        token,
        amount,
        donorAddress,
        donorName: existingRow.donor_name ?? null,
        message: existingRow.message ?? null,
      });
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
    if (userId && !existingRow.user_id) {
      update.user_id = userId;
    }
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

    donationId = existingRow.id;
    const finalDonorName =
      (update.donor_name as string | null | undefined) ?? existingRow.donor_name ?? null;
    const finalMessage =
      (update.message as string | null | undefined) ?? existingRow.message ?? null;

    return deliverLiveEventIfNeeded(service, input, {
      donationId,
      creatorProfileId,
      txHash,
      token,
      amount,
      donorAddress,
      donorName: finalDonorName,
      message: finalMessage,
    });
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

  creatorProfileId = (profile as ProfileRow).id;

  const insert: Record<string, unknown> = {
    tx_hash: txHash,
    creator_profile_id: creatorProfileId,
    handle_hash: handleHashBytea,
    token,
    amount,
    donor_name: donorName ?? "Anonymous",
    donor_address: donorAddress,
    status: "confirmed",
    message: message,
    moderation_status: classifyMessage(message, donorName ?? "Anonymous"),
    confirmed_at: nowIso(),
  };
  if (userId) {
    insert.user_id = userId;
  }
  const { data: inserted, error: insErr } = await service
    .from("donations")
    .insert(insert)
    .select("id")
    .single();
  if (insErr) return { status: 500, body: { error: "db_error" } };
  if (!inserted) return { status: 500, body: { error: "db_error" } };

  donationId = (inserted as { id: string }).id;
  return deliverLiveEventIfNeeded(service, input, {
    donationId,
    creatorProfileId,
    txHash,
    token,
    amount,
    donorAddress,
    donorName: donorName ?? "Anonymous",
    message: message,
  });
}

interface DeliverContext {
  donationId: string;
  creatorProfileId: string;
  txHash: string;
  token: string;
  amount: string;
  donorAddress: string;
  donorName: string | null;
  message: string | null;
}

interface PrepareDeliveryResult {
  error: null;
  overlayId: string;
  tokenSymbol: string;
  tokenDecimals: number;
}

interface PrepareDeliveryError {
  error: string;
}

async function prepareDelivery(
  service: SupabaseClient,
  input: { creatorProfileId: string; token: string },
): Promise<PrepareDeliveryResult | PrepareDeliveryError> {
  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("id,overlay_id")
    .eq("id", input.creatorProfileId)
    .maybeSingle();
  if (profileErr) return { error: "db_error" };
  if (!profile) return { error: "db_error" };
  const { overlay_id: overlayId } = profile as { overlay_id: string | null };
  if (!overlayId) return { error: "db_error" };

  const { data: tokenRow, error: tokenErr } = await service
    .from("tokens")
    .select("symbol,decimals")
    .eq("contract_address", input.token)
    .maybeSingle();
  if (tokenErr) return { error: "db_error" };

  return {
    error: null,
    overlayId,
    tokenSymbol: (tokenRow as { symbol: string | null } | null)?.symbol ?? input.token,
    tokenDecimals: (tokenRow as { decimals: number | null } | null)?.decimals ?? 0,
  };
}

interface EffectIntentRow {
  id: string;
  creator_profile_id: string;
  token: string;
  raw_amount: string;
  pack_id: string;
  pack_version: string;
  effect_id: string;
  donation_prep_id: string;
  status: string;
  expires_at: string;
  donation_id: string | null;
}

interface LiveEventSettingsRow {
  live_events_enabled: boolean;
}

async function suppressEffectIntent(
  service: SupabaseClient,
  intentId: string,
  reason: string,
): Promise<void> {
  await service
    .from("effect_intents")
    .update({ status: "suppressed", suppression_reason: reason })
    .eq("id", intentId);
}

async function deliverOrdinaryLiveEventIfNeeded(
  service: SupabaseClient,
  input: VerifyInput,
  ctx: DeliverContext,
): Promise<VerifyResult> {
  const delivery = await prepareDelivery(service, {
    creatorProfileId: ctx.creatorProfileId,
    token: ctx.token,
  });
  if (delivery.error !== null) return { status: 500, body: { error: delivery.error } };

  const expiresAt = new Date(Date.now() + LIVE_EVENT_EXPIRY_MS).toISOString();

  const result = await createOrdinaryLiveEvent(service, {
    creatorProfileId: ctx.creatorProfileId,
    overlayId: delivery.overlayId,
    donationId: ctx.donationId,
    txHash: ctx.txHash,
    donorName: ctx.donorName ?? "Anonymous",
    donorAddress: ctx.donorAddress,
    amount: ctx.amount,
    token: ctx.token,
    message: ctx.message,
    tokenSymbol: delivery.tokenSymbol,
    tokenDecimals: delivery.tokenDecimals,
    expiresAt,
  });

  if (!result.ok) {
    return { status: 500, body: { error: result.error } };
  }
  return { status: 200, body: { status: "confirmed" } };
}

async function deliverEffectLiveEventIfNeeded(
  service: SupabaseClient,
  input: VerifyInput,
  ctx: DeliverContext,
): Promise<VerifyResult> {
  const donationPrepId = input.donation_prep_id!;

  const delivery = await prepareDelivery(service, {
    creatorProfileId: ctx.creatorProfileId,
    token: ctx.token,
  });
  if (delivery.error !== null) return { status: 500, body: { error: delivery.error } };

  const expiresAt = new Date(Date.now() + LIVE_EVENT_EXPIRY_MS).toISOString();

  const { data: existingEvent, error: existingEventErr } = await service
    .from("live_events")
    .select("id,status")
    .eq("donation_id", ctx.donationId)
    .maybeSingle();
  if (existingEventErr) return { status: 500, body: { error: "db_error" } };
  if (existingEvent) {
    return { status: 200, body: { status: "confirmed" } };
  }

  const { data: intent, error: intentErr } = await service
    .from("effect_intents")
    .select(
      "id,creator_profile_id,token,raw_amount,pack_id,pack_version,effect_id,donation_prep_id,status,expires_at,donation_id",
    )
    .eq("donation_prep_id", donationPrepId)
    .maybeSingle();
  if (intentErr) return { status: 500, body: { error: "db_error" } };

  const ordinaryInput = {
    creatorProfileId: ctx.creatorProfileId,
    overlayId: delivery.overlayId,
    donationId: ctx.donationId,
    txHash: ctx.txHash,
    donorName: ctx.donorName ?? "Anonymous",
    donorAddress: ctx.donorAddress,
    amount: ctx.amount,
    token: ctx.token,
    message: ctx.message,
    tokenSymbol: delivery.tokenSymbol,
    tokenDecimals: delivery.tokenDecimals,
    expiresAt,
  };

  if (!intent) {
    const result = await createOrdinaryLiveEvent(service, ordinaryInput);
    if (!result.ok) return { status: 500, body: { error: result.error } };
    return { status: 200, body: { status: "confirmed" } };
  }

  const intentRow = intent as EffectIntentRow;

  if (intentRow.status === "suppressed") {
    const result = await createOrdinaryLiveEvent(service, ordinaryInput);
    if (!result.ok) return { status: 500, body: { error: result.error } };
    return { status: 200, body: { status: "confirmed" } };
  }

  if (intentRow.status === "consumed") {
    return { status: 200, body: { status: "confirmed" } };
  }

  if (new Date() > new Date(intentRow.expires_at)) {
    await suppressEffectIntent(service, intentRow.id, "expired");
    const result = await createOrdinaryLiveEvent(service, ordinaryInput);
    if (!result.ok) return { status: 500, body: { error: result.error } };
    return { status: 200, body: { status: "confirmed" } };
  }

  const matches =
    intentRow.creator_profile_id === ctx.creatorProfileId &&
    intentRow.token === ctx.token &&
    intentRow.raw_amount === ctx.amount;
  if (!matches) {
    await suppressEffectIntent(service, intentRow.id, "verification_mismatch");
    const result = await createOrdinaryLiveEvent(service, ordinaryInput);
    if (!result.ok) return { status: 500, body: { error: result.error } };
    return { status: 200, body: { status: "confirmed" } };
  }

  const { data: settings, error: settingsErr } = await service
    .from("live_event_settings")
    .select("live_events_enabled")
    .eq("creator_profile_id", ctx.creatorProfileId)
    .maybeSingle();
  if (settingsErr) return { status: 500, body: { error: "db_error" } };

  const enabled = (settings as LiveEventSettingsRow | null)?.live_events_enabled ?? false;
  if (!enabled) {
    await suppressEffectIntent(service, intentRow.id, "creator_disabled");
    const result = await createOrdinaryLiveEvent(service, ordinaryInput);
    if (!result.ok) return { status: 500, body: { error: result.error } };
    return { status: 200, body: { status: "confirmed" } };
  }

  const effectResult = await createEffectLiveEvent(service, {
    ...ordinaryInput,
    effectIntentId: intentRow.id,
    packId: intentRow.pack_id,
    packVersion: intentRow.pack_version,
    effectId: intentRow.effect_id,
  });
  if (!effectResult.ok) {
    return { status: 500, body: { error: effectResult.error } };
  }

  const { error: consumeErr } = await service
    .from("effect_intents")
    .update({ status: "consumed", donation_id: ctx.donationId })
    .eq("id", intentRow.id);
  if (consumeErr) return { status: 500, body: { error: "db_error" } };

  return { status: 200, body: { status: "confirmed" } };
}

async function deliverLiveEventIfNeeded(
  service: SupabaseClient,
  input: VerifyInput,
  ctx: DeliverContext,
): Promise<VerifyResult> {
  if (input.donation_prep_id) {
    return deliverEffectLiveEventIfNeeded(service, input, ctx);
  }
  return deliverOrdinaryLiveEventIfNeeded(service, input, ctx);
}
