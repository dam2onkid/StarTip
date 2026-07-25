// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ackLiveEvent, createLiveEventsAckApp } from "./acks";

type Method = "select" | "update";
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
      select(cols: string) { if (state.method === null) state.method = "select"; state.selectCols = cols; return self; },
      update(payload: unknown) { state.method = "update"; state.payload = payload; return self; },
      eq(col: string, value: unknown) { state.filters[col] = value; return self; },
      maybeSingle() { return commit(); },
      single() { return commit(); },
      then(onFulfilled?: (v: { data: unknown; error: unknown }) => unknown,
           onRejected?: (e: unknown) => unknown) {
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

  const supabase = { from: vi.fn((table: string) => query(table)) };
  return { supabase, calls, setResponder };
}

const SECRET = "test-secret";
const EVENT_ID = "00000000-0000-0000-0000-000000000001";
const OVERLAY_ID = "ov-test";
const DEFAULT_EVENT = {
  id: EVENT_ID,
  overlay_id: OVERLAY_ID,
  status: "queued",
  expires_at: "2099-01-01T00:00:00.000Z",
};

describe("ackLiveEvent", () => {
  let mock: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mock = createMockSupabase();
    mock.setResponder("live_events:update", () => ({ data: [{ id: EVENT_ID }], error: null }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 400 invalid_body when required fields are missing", async () => {
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { status: "started" } as unknown as Parameters<typeof ackLiveEvent>[2],
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_body" });
  });

  it("returns 400 invalid_body when status is not a valid transition", async () => {
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "bogus" } as unknown as Parameters<typeof ackLiveEvent>[2],
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_body" });
  });

  it("returns 404 event_not_found when the event does not exist", async () => {
    mock.setResponder("live_events:select", () => ({ data: null, error: null }));
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "started" },
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "event_not_found" });
  });

  it("returns 401 unauthorized when the overlay_id does not match the event", async () => {
    mock.setResponder("live_events:select", () => ({
      data: { ...DEFAULT_EVENT, overlay_id: "other-overlay" },
      error: null,
    }));
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "started" },
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("transitions a queued event to started and records ack_started_at", async () => {
    mock.setResponder("live_events:select", () => ({ data: DEFAULT_EVENT, error: null }));
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "started" },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: EVENT_ID, status: "started" });

    const update = mock.calls.find((c) => c.table === "live_events" && c.method === "update");
    expect(update).toBeDefined();
    expect(update!.filters).toMatchObject({ id: EVENT_ID, overlay_id: OVERLAY_ID, status: "queued" });
    expect(update!.payload).toMatchObject({ status: "started" });
    expect((update!.payload as Record<string, unknown>).ack_started_at).toEqual(expect.any(String));
  });

  it("transitions a started event to completed and records ack_terminal_at", async () => {
    mock.setResponder("live_events:select", () => ({
      data: { ...DEFAULT_EVENT, status: "started" },
      error: null,
    }));
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "completed" },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: EVENT_ID, status: "completed" });

    const update = mock.calls.find((c) => c.table === "live_events" && c.method === "update");
    expect(update!.payload).toMatchObject({ status: "completed" });
    expect((update!.payload as Record<string, unknown>).ack_terminal_at).toEqual(expect.any(String));
  });

  it("returns 409 already_terminal when the event is already completed with a different status", async () => {
    mock.setResponder("live_events:select", () => ({
      data: { ...DEFAULT_EVENT, status: "completed" },
      error: null,
    }));
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "failed" },
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "already_terminal" });
  });

  it("returns 200 idempotently when the event already has the requested status", async () => {
    mock.setResponder("live_events:select", () => ({
      data: { ...DEFAULT_EVENT, status: "started" },
      error: null,
    }));
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "started" },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: EVENT_ID, status: "started" });
    expect(mock.calls.some((c) => c.table === "live_events" && c.method === "update")).toBe(false);
  });

  it("rejects starting a queued event that has already passed its expiry", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2026-07-25T12:00:31.000Z"));
    mock.setResponder("live_events:select", () => ({
      data: { ...DEFAULT_EVENT, expires_at: "2026-07-25T12:00:30.000Z" },
      error: null,
    }));

    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "started" },
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "event_expired" });
  });

  it("transitions a queued event to expired", async () => {
    mock.setResponder("live_events:select", () => ({ data: DEFAULT_EVENT, error: null }));
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "expired" },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: EVENT_ID, status: "expired" });

    const update = mock.calls.find((c) => c.table === "live_events" && c.method === "update");
    expect(update!.payload).toMatchObject({ status: "expired" });
    expect((update!.payload as Record<string, unknown>).ack_terminal_at).toEqual(expect.any(String));
  });

  it("transitions a started event to stopped", async () => {
    mock.setResponder("live_events:select", () => ({
      data: { ...DEFAULT_EVENT, status: "started" },
      error: null,
    }));
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "stopped" },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: EVENT_ID, status: "stopped" });
  });

  it("rejects stopping a queued event before it has started", async () => {
    mock.setResponder("live_events:select", () => ({ data: DEFAULT_EVENT, error: null }));
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "stopped" },
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "invalid_transition" });
  });

  it("rejects completing a queued event before it has started", async () => {
    mock.setResponder("live_events:select", () => ({ data: DEFAULT_EVENT, error: null }));
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "completed" },
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "invalid_transition" });
  });

  it("returns 409 when the atomic status guard fails", async () => {
    mock.setResponder("live_events:select", () => ({ data: DEFAULT_EVENT, error: null }));
    mock.setResponder("live_events:update", () => ({ data: [], error: null }));
    const res = await ackLiveEvent(
      { service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] },
      EVENT_ID,
      { overlay_id: OVERLAY_ID, status: "started" },
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "invalid_transition" });
  });
});

describe("createLiveEventsAckApp", () => {
  let mock: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mock = createMockSupabase();
    mock.setResponder("live_events:select", () => ({ data: DEFAULT_EVENT, error: null }));
    mock.setResponder("live_events:update", () => ({ data: [{ id: EVENT_ID }], error: null }));
  });

  it("rejects requests without the worker secret", async () => {
    const app = createLiveEventsAckApp({ service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] }, SECRET);
    const res = await app.request(`/live-events/${EVENT_ID}/ack`, {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
      body: JSON.stringify({ overlay_id: OVERLAY_ID, status: "started" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("proxies a valid acknowledgement to ackLiveEvent", async () => {
    const app = createLiveEventsAckApp({ service: mock.supabase as unknown as Parameters<typeof ackLiveEvent>[0]["service"] }, SECRET);
    const res = await app.request(`/live-events/${EVENT_ID}/ack`, {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ overlay_id: OVERLAY_ID, status: "started" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: EVENT_ID, status: "started" });
  });
});
