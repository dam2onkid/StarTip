// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared Live Events - ordinary Donation delivery.
 *
 * Tests assert that a verified ordinary Donation creates one durable Live Event
 * with the right envelope fields, a server sequence, an expiry timestamp, and
 * idempotency when called again for the same donation.
 */

type Method = "select" | "insert" | "update" | "rpc";
interface RecordedCall {
  table: string;
  method: Method;
  filters: Record<string, unknown>;
  payload: unknown;
  selectCols: string | null;
}

function createMockSupabase() {
  const calls: RecordedCall[] = [];
  const responders: Record<string, (call: RecordedCall) => { data: unknown; error: unknown }> = {};

  function setResponder(key: string, fn: (call: RecordedCall) => { data: unknown; error: unknown }) {
    responders[key] = fn;
  }

  function query(table: string) {
    const state = {
      method: null as Method | null,
      filters: {} as Record<string, unknown>,
      payload: null as unknown,
      selectCols: null as string | null,
      committed: false,
    };
    const self = {
      select(cols: string) {
        if (state.method === null) state.method = "select";
        state.selectCols = cols;
        return self;
      },
      insert(payload: unknown) {
        if (state.method === null) state.method = "insert";
        state.payload = payload;
        return self;
      },
      update(payload: unknown) {
        if (state.method === null) state.method = "update";
        state.payload = payload;
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
      then(
        onFulfilled?: (v: { data: unknown; error: unknown }) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
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
      const r = responders[`${call.table}:${call.method}`];
      return Promise.resolve(r ? r(call) : { data: null, error: null });
    }
    return self;
  }

  function rpc(fn: string) {
    const state = { returned: false as false | { type: "returns" } };
    const chain = {
      returns<T>() { state.returned = { type: "returns" }; return chain as unknown as { single: () => Promise<{ data: T; error: unknown }> }; },
      single() {
        const call: RecordedCall = { table: `rpc:${fn}`, method: "rpc", filters: {}, payload: state.returned, selectCols: null };
        calls.push(call);
        const r = responders[`rpc:${fn}`];
        return Promise.resolve(r ? r(call) : { data: null, error: null });
      },
    };
    return chain;
  }

  const supabase = { from: vi.fn((table: string) => query(table)), rpc: vi.fn((fn: string) => rpc(fn)) };
  return { supabase, calls, setResponder };
}

function validInput() {
  return {
    creatorProfileId: "11111111-1111-1111-1111-111111111111",
    overlayId: "abc123overlayid",
    donationId: "22222222-2222-2222-2222-222222222222",
    txHash: "deadbeef".repeat(8),
    donorName: "Ada",
    donorAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    amount: "1000000",
    token: "CUSDC",
    message: "Great stream!",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    expiresAt: "2026-07-25T12:00:30.000Z",
  };
}

describe("createOrdinaryLiveEvent", () => {
  let mock: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mock = createMockSupabase();
  });

  it("creates a Live Event with the ordinary Donation envelope", async () => {
    mock.setResponder("live_events:select", () => ({ data: null, error: null }));
    mock.setResponder("rpc:next_live_event_sequence", () => ({ data: { next_live_event_sequence: 42 }, error: null }));
    mock.setResponder("live_events:insert", () => ({
      data: {
        id: "le-1",
        sequence: 42,
        created_at: "2026-07-25T12:00:00.000Z",
        expires_at: "2026-07-25T12:00:30.000Z",
      },
      error: null,
    }));

    const { createOrdinaryLiveEvent } = await import("./deliver");
    const result = await createOrdinaryLiveEvent(
      mock.supabase as unknown as SupabaseClient,
      validInput(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.sequence).toBe(42);

    const insertCall = mock.calls.find((c) => c.table === "live_events" && c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall?.payload).toMatchObject({
      creator_profile_id: "11111111-1111-1111-1111-111111111111",
      overlay_id: "abc123overlayid",
      donation_id: "22222222-2222-2222-2222-222222222222",
      sequence: 42,
      expires_at: "2026-07-25T12:00:30.000Z",
      status: "queued",
    });

    const payload = (insertCall?.payload as Record<string, unknown>).payload as Record<string, unknown>;
    expect(payload.event).toMatchObject({
      sequence: 42,
      expires_at: "2026-07-25T12:00:30.000Z",
    });
    expect(payload.donation).toMatchObject({
      id: "22222222-2222-2222-2222-222222222222",
      tx_hash: "deadbeef".repeat(8),
      donor_name: "Ada",
      donor_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      amount: "1000000",
      token: "CUSDC",
      message: "Great stream!",
    });
    expect(payload.creator).toEqual({
      profile_id: "11111111-1111-1111-1111-111111111111",
      overlay_id: "abc123overlayid",
    });
    expect(payload.token_display).toEqual({
      contract_address: "CUSDC",
      symbol: "USDC",
      decimals: 6,
    });
    expect(payload.effect).toBeNull();

    const updateCalls = mock.calls.filter((c) => c.table === "live_events" && c.method === "update");
    expect(updateCalls).toHaveLength(0);
  });

  it("is idempotent on the same donation", async () => {
    mock.setResponder("live_events:select", () => ({
      data: {
        id: "le-existing",
        sequence: 7,
        created_at: "2026-07-25T11:59:00.000Z",
        expires_at: "2026-07-25T12:00:00.000Z",
      },
      error: null,
    }));

    const { createOrdinaryLiveEvent } = await import("./deliver");
    const result = await createOrdinaryLiveEvent(
      mock.supabase as unknown as SupabaseClient,
      validInput(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.id).toBe("le-existing");
    expect(result.event.sequence).toBe(7);

    const insertCalls = mock.calls.filter((c) => c.table === "live_events" && c.method === "insert");
    expect(insertCalls).toHaveLength(0);
  });

  it("returns db_error when the sequence reservation fails", async () => {
    mock.setResponder("live_events:select", () => ({ data: null, error: null }));
    mock.setResponder("rpc:next_live_event_sequence", () => ({ data: null, error: { message: "boom" } }));

    const { createOrdinaryLiveEvent } = await import("./deliver");
    const result = await createOrdinaryLiveEvent(
      mock.supabase as unknown as SupabaseClient,
      validInput(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("db_error");
  });

  it("returns db_error when the insert fails", async () => {
    mock.setResponder("live_events:select", () => ({ data: null, error: null }));
    mock.setResponder("rpc:next_live_event_sequence", () => ({ data: { next_live_event_sequence: 42 }, error: null }));
    mock.setResponder("live_events:insert", () => ({ data: null, error: { message: "boom" } }));

    const { createOrdinaryLiveEvent } = await import("./deliver");
    const result = await createOrdinaryLiveEvent(
      mock.supabase as unknown as SupabaseClient,
      validInput(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("db_error");
  });

  it("is idempotent when a concurrent insert wins the unique donation_id index", async () => {
    let selectCalls = 0;
    mock.setResponder("live_events:select", () => {
      selectCalls++;
      if (selectCalls === 1) return { data: null, error: null };
      return {
        data: { id: "le-existing", sequence: 99, created_at: "2026-07-25T12:00:00.000Z", expires_at: "2026-07-25T12:00:30.000Z" },
        error: null,
      };
    });
    mock.setResponder("rpc:next_live_event_sequence", () => ({ data: { next_live_event_sequence: 42 }, error: null }));
    mock.setResponder("live_events:insert", () => ({ data: null, error: { code: "23505" } }));

    const { createOrdinaryLiveEvent } = await import("./deliver");
    const result = await createOrdinaryLiveEvent(
      mock.supabase as unknown as SupabaseClient,
      validInput(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.sequence).toBe(99);
  });

  describe("createEffectLiveEvent", () => {
  function validEffectInput() {
    return {
      ...validInput(),
      effectIntentId: "33333333-3333-3333-3333-333333333333",
      packId: "startip.default",
      packVersion: "1.0.0",
      effectId: "jump-scare",
    };
  }

  it("creates a Live Event with pinned pack, version, and effect identifiers", async () => {
    mock.setResponder("live_events:select", () => ({ data: null, error: null }));
    mock.setResponder("rpc:next_live_event_sequence", () => ({ data: { next_live_event_sequence: 42 }, error: null }));
    mock.setResponder("live_events:insert", () => ({
      data: {
        id: "le-effect",
        sequence: 42,
        created_at: "2026-07-25T12:00:00.000Z",
        expires_at: "2026-07-25T12:00:30.000Z",
      },
      error: null,
    }));

    const { createEffectLiveEvent } = await import("./deliver");
    const result = await createEffectLiveEvent(
      mock.supabase as unknown as SupabaseClient,
      validEffectInput(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.sequence).toBe(42);

    const insertCall = mock.calls.find((c) => c.table === "live_events" && c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall?.payload).toMatchObject({
      creator_profile_id: "11111111-1111-1111-1111-111111111111",
      overlay_id: "abc123overlayid",
      donation_id: "22222222-2222-2222-2222-222222222222",
      effect_intent_id: "33333333-3333-3333-3333-333333333333",
      sequence: 42,
      status: "queued",
    });

    const payload = (insertCall?.payload as Record<string, unknown>).payload as {
      effect: { pack_id: string; pack_version: string; effect_id: string };
      donation: { message: unknown };
    };
    expect(payload.effect).toEqual({
      pack_id: "startip.default",
      pack_version: "1.0.0",
      effect_id: "jump-scare",
    });
    expect(payload.donation.message).toBeNull();
  });

  it("is idempotent on the same donation", async () => {
    mock.setResponder("live_events:select", () => ({
      data: {
        id: "le-existing",
        sequence: 7,
        created_at: "2026-07-25T11:59:00.000Z",
        expires_at: "2026-07-25T12:00:00.000Z",
      },
      error: null,
    }));

    const { createEffectLiveEvent } = await import("./deliver");
    const result = await createEffectLiveEvent(
      mock.supabase as unknown as SupabaseClient,
      validEffectInput(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.sequence).toBe(7);

    const insertCalls = mock.calls.filter((c) => c.table === "live_events" && c.method === "insert");
    expect(insertCalls).toHaveLength(0);
  });
  });
});
