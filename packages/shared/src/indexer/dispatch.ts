import * as StellarSdk from "@stellar/stellar-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TokenMetadata } from "../stellar/token";
import { classifyMessage } from "../donations/moderation";
import { resolveProfileByHandleHash } from "../profiles/creator-profile-resolver";
import { ensureOverlayId } from "../overlay/id";

/** RPC surface the indexer depends on (structural subset of rpc.Server). */
export interface RpcLike {
  getEvents(
    request: StellarSdk.rpc.Api.GetEventsRequest,
  ): Promise<{ events: StellarSdk.rpc.Api.EventResponse[]; cursor: string }>;
  getLatestLedger(): Promise<{ sequence: number }>;
}

export interface IndexerDeps<R extends RpcLike = RpcLike> {
  supabase: SupabaseClient;
  rpc: R;
  tokenReader: (rpc: R, contractAddress: string) => Promise<TokenMetadata>;
  contractId: string;
  /**
   * Optional ledger to start from on the very first poll (when the cursor is
   * uninitialized). Typically the DonationRouter deploy ledger, set via the
   * `INDEXER_START_LEDGER` env var, so a fresh indexer scans history instead of
   * skipping events emitted before it began. When 0/unset, the first poll
   * starts at `getLatestLedger()`.
   */
  startLedger?: number;
}

export interface PollResult {
  processed: number;
  lastLedger: number | null;
  cursor: string | null;
  /** Present only when debug=true: per-event trace for diagnostics. */
  debug?: DebugEventTrace[];
}

/** One entry per event read in a debug poll. */
export interface DebugEventTrace {
  topic: string | null;
  ledger: number;
  txHash: string;
  value: Record<string, unknown>;
}

interface IndexerState {
  id: number;
  last_ledger: number;
  last_cursor: string | null;
}

interface DonationRow {
  id: string;
  status: string;
}

/** Decoded DonationRouter event: topic name + native field map. */
interface DecodedEvent {
  topic: string;
  value: Record<string, unknown>;
}

/**
 * Decode a Soroban contract event into its topic name and a native field map.
 * The DonationRouter emits each event as a single Symbol topic (the event
 * name) and an ScVal map body. `scValToNative` turns the map into a plain
 * object: Addresses become strkey strings, BytesN become Buffers, i128 become
 * bigints, booleans stay booleans. Returns null for events with no topic.
 */
export function decodeEvent(event: StellarSdk.rpc.Api.EventResponse): DecodedEvent | null {
  if (!event.topic || event.topic.length === 0) return null;
  const topic = StellarSdk.scValToNative(event.topic[0]);
  if (typeof topic !== "string") return null;
  const value = StellarSdk.scValToNative(event.value) as Record<string, unknown>;
  return { topic, value: value ?? {} };
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Load the single indexer_state row. Returns null if it is missing (the
 * migration seeds it, but the caller may run before the migration on a fresh
 * DB).
 */
async function loadState(supabase: SupabaseClient): Promise<IndexerState | null> {
  const { data, error } = await supabase
    .from("indexer_state")
    .select("id,last_ledger,last_cursor")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return (data as IndexerState | null) ?? null;
}

/** Dispatch a `DonationReceived` event: upsert the donation by tx_hash. */
async function dispatchDonationReceived(
  supabase: SupabaseClient,
  event: StellarSdk.rpc.Api.EventResponse,
  value: Record<string, unknown>,
): Promise<void> {
  const txHash = event.txHash;
  const amount = (value.amount as bigint).toString();

  // Match by tx_hash (the sole natural key per ADR-0005). The verify path may
  // have already inserted a confirmed row; the indexer reconciles missed
  // donations.
  const row = (
    await supabase
      .from("donations")
      .select("id,status")
      .eq("tx_hash", txHash)
      .maybeSingle()
  ).data as DonationRow | null;

  if (row) {
    // Update in place. Never downgrade confirmed -> indexed (ADR-0005: the
    // verify path sets confirmed; the indexer only reconciles). Re-writing
    // tx_hash/indexed_at is idempotent.
    const patch: Record<string, unknown> = {
      tx_hash: txHash,
      indexed_at: nowIso(),
    };
    await supabase.from("donations").update(patch).eq("id", row.id);
    return;
  }

  // No existing row: insert an indexed row. Requires the creator profile.
  const profile = await resolveProfileByHandleHash(supabase, value.creator_id_hash as Buffer);
  if (!profile) {
    // Orphan donation: creator has no off-chain profile. Skip.
    return;
  }

  await supabase.from("donations").insert({
    tx_hash: txHash,
    creator_profile_id: profile.id,
    handle_hash: profile.handle_hash,
    token: value.token as string,
    amount,
    donor_name: "Anonymous",
    status: "indexed",
    // No message is available from the on-chain event, so classifyMessage
    // sees (null, "Anonymous") and the orphan insert is `visible`.
    moderation_status: classifyMessage(null, "Anonymous"),
    indexed_at: nowIso(),
  });
}

/** Dispatch a `CreatorRegistered` event: flip onchain_registered on the profile. */
async function dispatchCreatorRegistered(
  supabase: SupabaseClient,
  value: Record<string, unknown>,
): Promise<void> {
  const owner = value.owner as string;
  const payoutAddress = value.payout_address as string;

  const profile = await resolveProfileByHandleHash(supabase, value.creator_id_hash as Buffer);
  if (!profile) {
    // Orphan: no off-chain profile reserved for this handle. Skip.
    return;
  }
  if (profile.owner_address !== owner) {
    // Owner mismatch: the on-chain owner is not the linked wallet. Skip to
    // avoid flipping a profile the user does not control.
    return;
  }

  await supabase
    .from("profiles")
    .update({
      onchain_registered: true,
      onchain_registered_at: nowIso(),
      payout_address: payoutAddress,
      overlay_id: ensureOverlayId(profile),
    })
    .eq("handle_hash", profile.handle_hash);
}

/** Dispatch a `CreatorPayoutUpdated` event: mirror the new payout address. */
async function dispatchCreatorPayoutUpdated(
  supabase: SupabaseClient,
  value: Record<string, unknown>,
): Promise<void> {
  const newPayout = value.new_payout_address as string;

  const profile = await resolveProfileByHandleHash(supabase, value.creator_id_hash as Buffer);
  if (!profile) return;

  await supabase
    .from("profiles")
    .update({ payout_address: newPayout })
    .eq("handle_hash", profile.handle_hash);
}

/** Dispatch a `CreatorActiveChanged` event: mirror paused = NOT active. */
async function dispatchCreatorActiveChanged(
  supabase: SupabaseClient,
  value: Record<string, unknown>,
): Promise<void> {
  const active = value.active as boolean;

  const profile = await resolveProfileByHandleHash(supabase, value.creator_id_hash as Buffer);
  if (!profile) return;

  await supabase
    .from("profiles")
    .update({ paused: !active })
    .eq("handle_hash", profile.handle_hash);
}

/** Dispatch a `TokenAllowlistUpdated` event: upsert or delete a tokens row. */
async function dispatchTokenAllowlistUpdated<R extends RpcLike>(
  deps: IndexerDeps<R>,
  value: Record<string, unknown>,
): Promise<void> {
  const token = value.token as string;
  const added = value.added as boolean;

  if (added) {
    const meta = await deps.tokenReader(deps.rpc, token);
    await deps.supabase.from("tokens").upsert({
      contract_address: meta.contractAddress,
      symbol: meta.symbol,
      name: meta.name,
      issuer: meta.issuer,
      decimals: meta.decimals,
    });
  } else {
    await deps.supabase.from("tokens").delete().eq("contract_address", token);
  }
}

/**
 * Run one indexer poll: load the cursor, fetch DonationRouter events from the
 * shared cursor, dispatch each by topic name, and persist the advanced cursor.
 *
 * Idempotency: every dispatch is an upsert or a same-value update, so
 * re-processing the same event (e.g. an overlapping ledger range when the
 * cursor did not advance) converges to the same state.
 *
 * @returns the number of dispatched events and the new cursor position.
 */
export async function processPoll<R extends RpcLike>(
  deps: IndexerDeps<R>,
  options: { debug?: boolean } = {},
): Promise<PollResult> {
  const { supabase, rpc, contractId } = deps;
  const debug = options.debug === true;
  const debugEvents: DebugEventTrace[] | null = debug ? [] : null;

  const state = await loadState(supabase);
  const lastLedger = state?.last_ledger ?? 0;
  const lastCursor = state?.last_cursor ?? null;

  // Bootstrap: when uninitialized (last_ledger = 0, no cursor), start from
  // the configured `INDEXER_START_LEDGER` (e.g. the DonationRouter deploy
  // ledger) so the first poll scans history. When that is unset (0), fall back
  // to the current ledger so a fresh indexer only sees events after it began.
  let startLedger = lastLedger;
  if (lastCursor === null && lastLedger === 0) {
    const configured = deps.startLedger ?? 0;
    if (configured > 0) {
      startLedger = configured;
    } else {
      const ledger = await rpc.getLatestLedger();
      startLedger = ledger.sequence;
    }
  }

  const request: StellarSdk.rpc.Api.GetEventsRequest = lastCursor
    ? { filters: [{ contractIds: [contractId] }], cursor: lastCursor }
    : { filters: [{ contractIds: [contractId] }], startLedger };
  const response = await rpc.getEvents(request);
  const events = response.events ?? [];

  let processed = 0;
  for (const event of events) {
    const decoded = decodeEvent(event);
    if (debugEvents) {
      debugEvents.push({
        topic: decoded?.topic ?? null,
        ledger: event.ledger,
        txHash: event.txHash,
        value: decoded?.value ?? {},
      });
    }
    if (!decoded) continue;
    switch (decoded.topic) {
      case "donation_received":
        await dispatchDonationReceived(supabase, event, decoded.value);
        processed++;
        break;
      case "creator_registered":
        await dispatchCreatorRegistered(supabase, decoded.value);
        processed++;
        break;
      case "creator_payout_updated":
        await dispatchCreatorPayoutUpdated(supabase, decoded.value);
        processed++;
        break;
      case "creator_active_changed":
        await dispatchCreatorActiveChanged(supabase, decoded.value);
        processed++;
        break;
      case "token_allowlist_updated":
        await dispatchTokenAllowlistUpdated(deps, decoded.value);
        processed++;
        break;
      default:
        // Unknown topic (e.g. admin-only events like treasury_updated). Skip
        // dispatch but still advance the cursor past it below.
        break;
    }
  }

  // Advance the cursor whenever we read any events, including skipped ones,
  // so unknown events are not re-read forever. Use the last event's ledger
  // (for diagnostics / restart) and the response cursor (for the next poll).
  if (events.length > 0) {
    const lastEventLedger = events[events.length - 1].ledger;
    await supabase
      .from("indexer_state")
      .update({
        last_ledger: lastEventLedger,
        last_cursor: response.cursor,
        updated_at: nowIso(),
      })
      .eq("id", 1);
    return {
      processed,
      lastLedger: lastEventLedger,
      cursor: response.cursor,
      debug: debugEvents ?? undefined,
    };
  }

  return {
    processed: 0,
    lastLedger: lastLedger,
    cursor: lastCursor,
    debug: debugEvents ?? undefined,
  };
}
