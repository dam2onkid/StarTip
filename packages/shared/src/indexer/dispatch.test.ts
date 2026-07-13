// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import type { RpcLike } from "./dispatch";
import type { TokenMetadata } from "../stellar/token";
import { toByteaHex } from "../bytea";

const CONTRACT_ID = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";
const CREATOR_G = "GDF6CFYOXQTZVSLLK2RTDAUZ6N2E72IL4K2L34HXZK32KBR4NLVPLUVA";
const HANDLE_HASH = Buffer.alloc(32, 0xab);

const HANDLE_HASH_HEX = toByteaHex(HANDLE_HASH);

/**
 * Build an Api.EventResponse for a DonationRouter contract event. The topic is
 * a single Symbol ScVal (the event name); the value is an ScVal map built from
 * the given fields. Address fields become scvAddress, Buffers become scvBytes,
 * bigints become scvI128, booleans become scvBool, strings become scvString.
 */
function makeEvent(
  topic: string,
  fields: Record<string, unknown>,
  overrides: { txHash?: string; ledger?: number; id?: string } = {},
): StellarSdk.rpc.Api.EventResponse {
  const entries = Object.entries(fields).map(([key, value]) => {
    let val: StellarSdk.xdr.ScVal;
    if (Buffer.isBuffer(value)) {
      val = StellarSdk.xdr.ScVal.scvBytes(value);
    } else if (typeof value === "bigint") {
      val = new StellarSdk.ScInt(value).toI128();
    } else if (typeof value === "boolean") {
      val = StellarSdk.xdr.ScVal.scvBool(value);
    } else if (typeof value === "string" && value.startsWith("G") && value.length === 56) {
      val = StellarSdk.Address.fromString(value).toScVal();
    } else if (typeof value === "string") {
      val = StellarSdk.xdr.ScVal.scvString(value);
    } else {
      throw new Error(`unsupported field type for ${key}`);
    }
    return new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol(key),
      val,
    });
  });
  return {
    id: overrides.id ?? "evt-1",
    type: "contract",
    ledger: overrides.ledger ?? 100,
    ledgerClosedAt: "2026-01-01T00:00:00Z",
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: overrides.txHash ?? "txhash-1",
    contractId: CONTRACT_ID,
    topic: [StellarSdk.xdr.ScVal.scvSymbol(topic)],
    value: StellarSdk.xdr.ScVal.scvMap(entries),
  } as unknown as StellarSdk.rpc.Api.EventResponse;
}

/**
 * Fluent Supabase mock. Records every committed query and lets the test
 * configure responses keyed by table + method. Selects resolve via
 * `.maybeSingle()` / `.single()`; mutations resolve when awaited directly.
 */
type Method = "select" | "insert" | "update" | "upsert" | "delete";
interface RecordedCall {
  table: string;
  method: Method;
  filters: Record<string, unknown>;
  payload: unknown;
  selectCols: string | null;
}

function createMockSupabase() {
  const calls: RecordedCall[] = [];
  // Responders keyed by `${table}:${method}`. Each returns { data, error }.
  const responders: Record<string, (call: RecordedCall) => { data: unknown; error: unknown }> = {};

  function respond(call: RecordedCall) {
    const key = `${call.table}:${call.method}`;
    const r = responders[key];
    if (r) return r(call);
    return { data: null, error: null };
  }

  function setResponder(key: string, fn: (call: RecordedCall) => { data: unknown; error: unknown }) {
    responders[key] = fn;
  }

  function query(table: string) {
    const state: { method: Method | null; filters: Record<string, unknown>; payload: unknown; selectCols: string | null; committed: boolean } = {
      method: null,
      filters: {},
      payload: null,
      selectCols: null,
      committed: false,
    };
    const self = {
      select(cols: string) {
        state.method = "select";
        state.selectCols = cols;
        return self;
      },
      insert(payload: unknown) {
        state.method = "insert";
        state.payload = payload;
        return self;
      },
      update(payload: unknown) {
        state.method = "update";
        state.payload = payload;
        return self;
      },
      upsert(payload: unknown) {
        state.method = "upsert";
        state.payload = payload;
        return self;
      },
      delete() {
        state.method = "delete";
        return self;
      },
      eq(col: string, value: unknown) {
        state.filters[col] = value;
        return self;
      },
      maybeSingle() {
        return commit();
      },
      single() {
        return commit();
      },
      then(onFulfilled?: (v: { data: unknown; error: unknown }) => unknown,
           onRejected?: (e: unknown) => unknown) {
        // Mutations are awaited directly (without maybeSingle). Selects are
        // always resolved via maybeSingle/single, so `then` only fires for
        // mutations here.
        return commit().then(
          onFulfilled as ((v: unknown) => unknown) | null,
          onRejected as ((e: unknown) => unknown) | null,
        );
      },
    };
    function commit() {
      if (state.committed) return Promise.resolve({ data: null, error: null });
      state.committed = true;
      const call: RecordedCall = {
        table,
        method: (state.method ?? "select") as Method,
        filters: { ...state.filters },
        payload: state.payload,
        selectCols: state.selectCols,
      };
      calls.push(call);
      return Promise.resolve(respond(call));
    }
    return self;
  }

  const supabase = {
    from: vi.fn((table: string) => query(table)),
  };
  return { supabase, calls, setResponder };
}

function createMockRpc(events: StellarSdk.rpc.Api.EventResponse[], cursor = "cursor-next", sequence = 50) {
  return {
    getEvents: vi.fn(async (req: StellarSdk.rpc.Api.GetEventsRequest) => ({
      events,
      cursor,
      latestLedger: 200,
      oldestLedger: 1,
      latestLedgerCloseTime: "2026-01-01T00:00:10Z",
      oldestLedgerCloseTime: "2026-01-01T00:00:00Z",
    })),
    getLatestLedger: vi.fn(async () => ({ sequence, id: "ledger-id", protocolVersion: "22", closeTime: "2026-01-01T00:00:00Z" })),
  };
}

/** Find a recorded call by table + method, returning the first match. */
function findCall(calls: RecordedCall[], table: string, method: Method): RecordedCall | undefined {
  return calls.find((c) => c.table === table && c.method === method);
}

describe("indexer/dispatch processPoll", () => {
  let tokenReader: ReturnType<typeof vi.fn<(rpc: RpcLike, contractAddress: string) => Promise<TokenMetadata>>>;

  beforeEach(() => {
    tokenReader = vi.fn(async () => ({
      contractAddress: "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
      symbol: "USDC",
      name: "USD Coin",
      issuer: CREATOR_G,
      decimals: 6,
    }));
  });

  it("issues one getEvents call filtered by contract id", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));

    const rpc = createMockRpc([]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    expect(rpc.getEvents).toHaveBeenCalledTimes(1);
    const req = rpc.getEvents.mock.calls[0][0] as StellarSdk.rpc.Api.GetEventsRequest;
    expect(req.filters).toEqual([{ contractIds: [CONTRACT_ID] }]);
  });

  it("uses cursor mode when last_cursor is present", async () => {
    const { supabase, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));

    const rpc = createMockRpc([]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    const req = rpc.getEvents.mock.calls[0][0] as { cursor?: string; startLedger?: number };
    expect(req.cursor).toBe("cur");
    expect(req.startLedger).toBeUndefined();
  });

  it("bootstraps from getLatestLedger when last_ledger is 0 and no cursor", async () => {
    const { supabase, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 0, last_cursor: null }, error: null }));

    const rpc = createMockRpc([]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    expect(rpc.getLatestLedger).toHaveBeenCalled();
    const req = rpc.getEvents.mock.calls[0][0] as { cursor?: string; startLedger?: number };
    expect(req.startLedger).toBe(50);
    expect(req.cursor).toBeUndefined();
  });

  it("bootstraps from deps.startLedger when provided, skipping getLatestLedger", async () => {
    const { supabase, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 0, last_cursor: null }, error: null }));

    const rpc = createMockRpc([]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID, startLedger: 3_000_000 });

    // History is scanned from the configured ledger, not the current one.
    expect(rpc.getLatestLedger).not.toHaveBeenCalled();
    const req = rpc.getEvents.mock.calls[0][0] as { cursor?: string; startLedger?: number };
    expect(req.startLedger).toBe(3_000_000);
    expect(req.cursor).toBeUndefined();
  });

  it("DonationReceived: updates an existing indexed row in place (idempotent tx_hash + indexed_at, no status change)", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("donations:select", () => ({ data: { id: "d1", status: "indexed" }, error: null }));

    const event = makeEvent("donation_received", {
      creator_id_hash: HANDLE_HASH,
      token: "USDC-CONTRACT",
      amount: BigInt("1000000"),
      fee_amount: BigInt("50000"),
      net_amount: BigInt("950000"),
      treasury_address: CREATOR_G,
      payout_address: CREATOR_G,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    const update = findCall(calls, "donations", "update");
    expect(update).toBeDefined();
    expect(update!.filters).toEqual({ id: "d1" });
    expect(update!.payload).toMatchObject({
      tx_hash: "txhash-1",
      indexed_at: expect.any(String),
    });
    expect((update!.payload as Record<string, unknown>).status).toBeUndefined();
  });

  it("DonationReceived: inserts a new indexed row when no existing row matches by tx_hash and the creator profile exists", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    // No existing row by tx_hash.
    setResponder("donations:select", () => ({ data: null, error: null }));
    setResponder("profiles:select", () => ({ data: { id: "p1", owner_address: CREATOR_G }, error: null }));

    const event = makeEvent("donation_received", {
      creator_id_hash: HANDLE_HASH,
      token: "USDC-CONTRACT",
      amount: BigInt("1000000"),
      fee_amount: BigInt("50000"),
      net_amount: BigInt("950000"),
      treasury_address: CREATOR_G,
      payout_address: CREATOR_G,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    const insert = findCall(calls, "donations", "insert");
    expect(insert).toBeDefined();
    expect(insert!.payload).toMatchObject({
      tx_hash: "txhash-1",
      creator_profile_id: "p1",
      handle_hash: HANDLE_HASH_HEX,
      token: "USDC-CONTRACT",
      amount: "1000000",
      donor_name: "Anonymous",
      status: "indexed",
      indexed_at: expect.any(String),
    });
    // The indexer has no message, so classifyMessage sees (null, "Anonymous")
    // and the orphan insert is `visible` (ADR-0003).
    expect((insert!.payload as Record<string, unknown>).moderation_status).toBe("visible");
  });

  it("DonationReceived: skips when no existing row and no matching creator profile (orphan)", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("donations:select", () => ({ data: null, error: null }));
    setResponder("profiles:select", () => ({ data: null, error: null }));

    const event = makeEvent("donation_received", {
      creator_id_hash: HANDLE_HASH,
      token: "USDC-CONTRACT",
      amount: BigInt("1000000"),
      fee_amount: BigInt("0"),
      net_amount: BigInt("1000000"),
      treasury_address: CREATOR_G,
      payout_address: CREATOR_G,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    expect(findCall(calls, "donations", "insert")).toBeUndefined();
    expect(findCall(calls, "donations", "update")).toBeUndefined();
  });

  it("DonationReceived: does not downgrade a confirmed row back to indexed", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("donations:select", () => ({ data: { id: "d1", status: "confirmed" }, error: null }));

    const event = makeEvent("donation_received", {
      creator_id_hash: HANDLE_HASH,
      token: "USDC-CONTRACT",
      amount: BigInt("1000000"),
      fee_amount: BigInt("0"),
      net_amount: BigInt("1000000"),
      treasury_address: CREATOR_G,
      payout_address: CREATOR_G,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    const update = findCall(calls, "donations", "update");
    expect(update).toBeDefined();
    expect(update!.payload).toMatchObject({ tx_hash: "txhash-1", indexed_at: expect.any(String) });
    expect((update!.payload as Record<string, unknown>).status).toBeUndefined();
  });

  it("DonationReceived: re-processing the same event is idempotent (no second insert, same-value update)", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("donations:select", () => ({ data: { id: "d1", status: "indexed" }, error: null }));

    const event = makeEvent("donation_received", {
      creator_id_hash: HANDLE_HASH,
      token: "USDC-CONTRACT",
      amount: BigInt("1000000"),
      fee_amount: BigInt("0"),
      net_amount: BigInt("1000000"),
      treasury_address: CREATOR_G,
      payout_address: CREATOR_G,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    expect(findCall(calls, "donations", "insert")).toBeUndefined();
    const update = findCall(calls, "donations", "update");
    expect(update).toBeDefined();
    // status stays indexed (no downgrade), tx_hash re-written to the same value.
    expect((update!.payload as Record<string, unknown>).status).toBeUndefined();
    expect((update!.payload as Record<string, unknown>).tx_hash).toBe("txhash-1");
  });

  it("CreatorRegistered: flips onchain_registered and sets payout_address + onchain_registered_at when owner matches", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("profiles:select", () => ({ data: { id: "p1", owner_address: CREATOR_G }, error: null }));

    const event = makeEvent("creator_registered", {
      creator_id_hash: HANDLE_HASH,
      owner: CREATOR_G,
      payout_address: CREATOR_G,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    const update = findCall(calls, "profiles", "update");
    expect(update).toBeDefined();
    expect(update!.filters).toEqual({ handle_hash: HANDLE_HASH_HEX });
    expect(update!.payload).toMatchObject({
      onchain_registered: true,
      onchain_registered_at: expect.any(String),
      payout_address: CREATOR_G,
    });
    expect((update!.payload as { overlay_id: string }).overlay_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("CreatorRegistered: preserves an existing overlay_id", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("profiles:select", () => ({ data: { id: "p1", owner_address: CREATOR_G, overlay_id: "existing000overlay000id000000000" }, error: null }));

    const event = makeEvent("creator_registered", {
      creator_id_hash: HANDLE_HASH,
      owner: CREATOR_G,
      payout_address: CREATOR_G,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    const update = findCall(calls, "profiles", "update");
    expect(update).toBeDefined();
    expect((update!.payload as { overlay_id: string }).overlay_id).toBe("existing000overlay000id000000000");
  });

  it("CreatorRegistered: skips when no matching profile (orphan)", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("profiles:select", () => ({ data: null, error: null }));

    const event = makeEvent("creator_registered", {
      creator_id_hash: HANDLE_HASH,
      owner: CREATOR_G,
      payout_address: CREATOR_G,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    expect(findCall(calls, "profiles", "update")).toBeUndefined();
  });

  it("CreatorRegistered: skips when owner does not match the linked wallet", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("profiles:select", () => ({ data: { id: "p1", owner_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" }, error: null }));

    const event = makeEvent("creator_registered", {
      creator_id_hash: HANDLE_HASH,
      owner: CREATOR_G,
      payout_address: CREATOR_G,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    expect(findCall(calls, "profiles", "update")).toBeUndefined();
  });

  it("CreatorPayoutUpdated: mirrors the new payout_address", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("profiles:select", () => ({ data: { id: "p1", owner_address: CREATOR_G }, error: null }));

    const event = makeEvent("creator_payout_updated", {
      creator_id_hash: HANDLE_HASH,
      old_payout_address: CREATOR_G,
      new_payout_address: CREATOR_G,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    const update = findCall(calls, "profiles", "update");
    expect(update).toBeDefined();
    expect(update!.payload).toMatchObject({ payout_address: CREATOR_G });
  });

  it("CreatorActiveChanged: mirrors paused = NOT active", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));

    const pauseEvent = makeEvent("creator_active_changed", {
      creator_id_hash: HANDLE_HASH,
      active: false,
    });
    const rpc = createMockRpc([pauseEvent]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    const update = findCall(calls, "profiles", "update");
    expect(update).toBeDefined();
    expect(update!.payload).toMatchObject({ paused: true });
  });

  it("CreatorActiveChanged: active=true sets paused=false", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));

    const event = makeEvent("creator_active_changed", {
      creator_id_hash: HANDLE_HASH,
      active: true,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    const update = findCall(calls, "profiles", "update");
    expect(update!.payload).toMatchObject({ paused: false });
  });

  it("TokenAllowlistUpdated added: upserts a tokens row with metadata from one contract read", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));

    const tokenContract = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";
    const event = makeEvent("token_allowlist_updated", {
      token: tokenContract,
      added: true,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    expect(tokenReader).toHaveBeenCalledTimes(1);
    expect(tokenReader).toHaveBeenCalledWith(rpc, tokenContract);
    const upsert = findCall(calls, "tokens", "upsert");
    expect(upsert).toBeDefined();
    expect(upsert!.payload).toMatchObject({
      contract_address: tokenContract,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      issuer: CREATOR_G,
    });
  });

  it("TokenAllowlistUpdated removed: deletes the tokens row", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));

    const tokenContract = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW";
    const event = makeEvent("token_allowlist_updated", {
      token: tokenContract,
      added: false,
    });
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    expect(tokenReader).not.toHaveBeenCalled();
    const del = findCall(calls, "tokens", "delete");
    expect(del).toBeDefined();
    expect(del!.filters).toEqual({ contract_address: tokenContract });
  });

  it("advances the cursor: updates indexer_state with the last event ledger and response cursor", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));
    setResponder("profiles:select", () => ({ data: { id: "p1" }, error: null }));

    const e1 = makeEvent("creator_active_changed", { creator_id_hash: HANDLE_HASH, active: true }, { ledger: 110, id: "e1" });
    const e2 = makeEvent("creator_active_changed", { creator_id_hash: HANDLE_HASH, active: false }, { ledger: 120, id: "e2" });
    const rpc = createMockRpc([e1, e2], "next-cursor");
    const { processPoll } = await import("./dispatch");
    const result = await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    expect(result.processed).toBe(2);
    const stateUpdate = findCall(calls, "indexer_state", "update");
    expect(stateUpdate).toBeDefined();
    expect(stateUpdate!.filters).toEqual({ id: 1 });
    expect(stateUpdate!.payload).toMatchObject({
      last_ledger: 120,
      last_cursor: "next-cursor",
      updated_at: expect.any(String),
    });
  });

  it("does not update indexer_state when there are no events", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));

    const rpc = createMockRpc([]);
    const { processPoll } = await import("./dispatch");
    const result = await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    expect(result.processed).toBe(0);
    expect(findCall(calls, "indexer_state", "update")).toBeUndefined();
  });

  it("ignores events with unknown topic names", async () => {
    const { supabase, calls, setResponder } = createMockSupabase();
    setResponder("indexer_state:select", () => ({ data: { id: 1, last_ledger: 100, last_cursor: "cur" }, error: null }));

    const event = makeEvent(" treasury_updated", { old_treasury_address: CREATOR_G, new_treasury_address: CREATOR_G });
    // fix the topic to a real unknown one
    (event as unknown as { topic: StellarSdk.xdr.ScVal[] }).topic = [
      StellarSdk.xdr.ScVal.scvSymbol("treasury_updated"),
    ];
    const rpc = createMockRpc([event]);
    const { processPoll } = await import("./dispatch");
    const result = await processPoll({ supabase: supabase as any, rpc, tokenReader, contractId: CONTRACT_ID });

    expect(result.processed).toBe(0);
    // cursor still advances based on the last event ledger even if skipped? No:
    // skipped events should still advance the cursor so we don't re-read them
    // forever. The last_ledger should reflect the last event processed-or-skipped.
    const stateUpdate = findCall(calls, "indexer_state", "update");
    expect(stateUpdate).toBeDefined();
    expect(stateUpdate!.payload).toMatchObject({ last_ledger: 100, last_cursor: "cursor-next" });
  });
});
