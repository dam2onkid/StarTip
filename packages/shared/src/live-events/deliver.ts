/// <reference lib="dom" />
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

export interface CreateEffectLiveEventInput extends CreateOrdinaryLiveEventInput {
  effectIntentId: string;
  packId: string;
  packVersion: string;
  effectId: string;
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

export interface LiveEventEffect {
  pack_id: string;
  pack_version: string;
  effect_id: string;
}

export interface LiveEventEnvelope {
  event: LiveEventMeta;
  donation: LiveEventDonation;
  creator: LiveEventCreator;
  token_display: TokenDisplay;
  effect: LiveEventEffect | null;
}

interface LiveEventRow {
  id: string;
  sequence: number;
  created_at: string;
  expires_at: string;
  payload: LiveEventEnvelope;
}

function buildPayload(
  input: CreateOrdinaryLiveEventInput | CreateEffectLiveEventInput,
  meta: LiveEventMeta,
  effect: LiveEventEffect | null,
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
      message: effect ? null : input.message,
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
    effect,
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

  const createdAt = new Date().toISOString();
  const eventId = crypto.randomUUID();

  const { data: seq, error: seqErr } = await service
    .rpc("next_live_event_sequence")
    .returns<{ next_live_event_sequence: number }>()
    .single();
  if (seqErr) return { ok: false, error: "db_error" };

  const seqData = seq as { next_live_event_sequence: number } | null;
  if (!seqData) return { ok: false, error: "db_error" };

  const meta: LiveEventMeta = {
    id: eventId,
    sequence: seqData.next_live_event_sequence,
    created_at: createdAt,
    expires_at: input.expiresAt,
  };

  const { data: inserted, error: insertErr } = await service
    .from("live_events")
    .insert({
      id: eventId,
      creator_profile_id: input.creatorProfileId,
      overlay_id: input.overlayId,
      donation_id: input.donationId,
      sequence: seqData.next_live_event_sequence,
      status: "queued",
      created_at: createdAt,
      expires_at: input.expiresAt,
      payload: buildPayload(input, meta, null) as unknown as Record<string, unknown>,
    })
    .select("id,sequence,created_at,expires_at")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: retry, error: retryErr } = await service
        .from("live_events")
        .select("id,sequence,created_at,expires_at")
        .eq("donation_id", input.donationId)
        .maybeSingle();
      if (retryErr || !retry) return { ok: false, error: "db_error" };
      const row = retry as LiveEventRow;
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
    return { ok: false, error: "db_error" };
  }

  if (!inserted) return { ok: false, error: "db_error" };

  const row = inserted as LiveEventRow;
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

/**
 * Persist a verified Donation Effect as a durable, Creator-scoped Live Event.
 * The envelope pins the exact pack ID, immutable pack version, and effect ID.
 * Idempotent on `donation_id` so settlement verification retries produce exactly
 * one Live Event.
 */
export async function createEffectLiveEvent(
  service: SupabaseClient,
  input: CreateEffectLiveEventInput,
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

  const createdAt = new Date().toISOString();
  const eventId = crypto.randomUUID();

  const { data: seq, error: seqErr } = await service
    .rpc("next_live_event_sequence")
    .returns<{ next_live_event_sequence: number }>()
    .single();
  if (seqErr) return { ok: false, error: "db_error" };

  const seqData = seq as { next_live_event_sequence: number } | null;
  if (!seqData) return { ok: false, error: "db_error" };

  const meta: LiveEventMeta = {
    id: eventId,
    sequence: seqData.next_live_event_sequence,
    created_at: createdAt,
    expires_at: input.expiresAt,
  };

  const effect: LiveEventEffect = {
    pack_id: input.packId,
    pack_version: input.packVersion,
    effect_id: input.effectId,
  };

  const { data: inserted, error: insertErr } = await service
    .from("live_events")
    .insert({
      id: eventId,
      creator_profile_id: input.creatorProfileId,
      overlay_id: input.overlayId,
      donation_id: input.donationId,
      effect_intent_id: input.effectIntentId,
      sequence: seqData.next_live_event_sequence,
      status: "queued",
      created_at: createdAt,
      expires_at: input.expiresAt,
      payload: buildPayload(input, meta, effect) as unknown as Record<string, unknown>,
    })
    .select("id,sequence,created_at,expires_at")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: retry, error: retryErr } = await service
        .from("live_events")
        .select("id,sequence,created_at,expires_at")
        .eq("donation_id", input.donationId)
        .maybeSingle();
      if (retryErr || !retry) return { ok: false, error: "db_error" };
      const row = retry as LiveEventRow;
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
    return { ok: false, error: "db_error" };
  }

  if (!inserted) return { ok: false, error: "db_error" };

  const row = inserted as LiveEventRow;
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
