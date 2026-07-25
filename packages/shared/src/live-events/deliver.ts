import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared Live Event delivery.
 *
 * `createOrdinaryLiveEvent` persists a verified ordinary Donation as a durable,
 * Creator-scoped Live Event with a server sequence and a JSONB envelope. The
 * function is idempotent on `donation_id` so settlement verification retries
 * produce exactly one Live Event.
 */

export interface CreateOrdinaryLiveEventInput {
  creatorProfileId: string;
  overlayId: string;
  donationId: string;
  txHash: string;
  donorName: string;
  donorAddress: string;
  amount: string;
  token: string;
  message: string | null;
  tokenSymbol: string;
  tokenDecimals: number;
  expiresAt: string;
}

export interface CreatedLiveEvent {
  id: string;
  sequence: number;
  createdAt: string;
  expiresAt: string;
}

interface TokenDisplay {
  contract_address: string;
  symbol: string;
  decimals: number;
}

interface LiveEventDonation {
  id: string;
  tx_hash: string;
  donor_name: string;
  donor_address: string;
  amount: string;
  token: string;
  message: string | null;
}

interface LiveEventCreator {
  profile_id: string;
  overlay_id: string;
}

interface LiveEventMeta {
  id: string;
  sequence: number;
  created_at: string;
  expires_at: string;
}

export interface LiveEventEnvelope {
  event: LiveEventMeta;
  donation: LiveEventDonation;
  creator: LiveEventCreator;
  token_display: TokenDisplay;
  effect: null;
}

interface LiveEventRow {
  id: string;
  sequence: number;
  created_at: string;
  expires_at: string;
  payload: LiveEventEnvelope;
}

function buildPayload(
  input: CreateOrdinaryLiveEventInput,
  meta: LiveEventMeta,
): LiveEventEnvelope {
  return {
    event: meta,
    donation: {
      id: input.donationId,
      tx_hash: input.txHash,
      donor_name: input.donorName,
      donor_address: input.donorAddress,
      amount: input.amount,
      token: input.token,
      message: input.message,
    },
    creator: {
      profile_id: input.creatorProfileId,
      overlay_id: input.overlayId,
    },
    token_display: {
      contract_address: input.token,
      symbol: input.tokenSymbol,
      decimals: input.tokenDecimals,
    },
    effect: null,
  };
}

export async function createOrdinaryLiveEvent(
  service: SupabaseClient,
  input: CreateOrdinaryLiveEventInput,
): Promise<{ ok: true; event: CreatedLiveEvent } | { ok: false; error: string }> {
  const { data: existing, error: selectErr } = await service
    .from("live_events")
    .select("id,sequence,created_at,expires_at,payload")
    .eq("donation_id", input.donationId)
    .maybeSingle();

  if (selectErr) return { ok: false, error: "db_error" };
  if (existing) {
    const row = existing as LiveEventRow;
    return {
      ok: true,
      event: {
        id: row.id,
        sequence: row.sequence,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      },
    };
  }

  const { data: inserted, error: insertErr } = await service
    .from("live_events")
    .insert({
      creator_profile_id: input.creatorProfileId,
      overlay_id: input.overlayId,
      donation_id: input.donationId,
      status: "queued",
      expires_at: input.expiresAt,
    })
    .select("id,sequence,created_at,expires_at")
    .single();

  if (insertErr) return { ok: false, error: "db_error" };
  if (!inserted) return { ok: false, error: "db_error" };

  const row = inserted as LiveEventRow;
  const meta: LiveEventMeta = {
    id: row.id,
    sequence: row.sequence,
    created_at: row.created_at,
    expires_at: row.expires_at,
  };

  const { error: updateErr } = await service
    .from("live_events")
    .update({ payload: buildPayload(input, meta) as unknown as Record<string, unknown> })
    .eq("id", row.id);

  if (updateErr) return { ok: false, error: "db_error" };

  return {
    ok: true,
    event: {
      id: row.id,
      sequence: row.sequence,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    },
  };
}
