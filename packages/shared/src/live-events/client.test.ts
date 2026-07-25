// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LiveEventClient,
  type LiveEventChannelFactory,
  type LiveEventChannel,
  type RealtimeChannelStatus,
  type LiveEventRow,
  type LiveEventQueueItem,
  type LiveEventClientState,
} from "./client";

interface MockFactory {
  factory: LiveEventChannelFactory;
  simulateStatus: (status: string) => void;
  simulateInsert: (row: LiveEventRow) => void;
  createCount: () => number;
}

function createMockFactory(): MockFactory {
  let statusHandler: ((status: RealtimeChannelStatus) => void) | null = null;
  let insertHandler: ((row: LiveEventRow) => void) | null = null;
  let count = 0;

  return {
    factory: {
      createChannel(_overlayId: string, onInsert) {
        count += 1;
        insertHandler = onInsert;
        return {
          subscribe(onStatus) {
            statusHandler = onStatus;
            return () => {
              statusHandler = null;
              insertHandler = null;
            };
          },
        } as LiveEventChannel;
      },
    },
    simulateStatus(status: string) {
      statusHandler?.({ status });
    },
    simulateInsert(row: LiveEventRow) {
      insertHandler?.(row);
    },
    createCount: () => count,
  };
}

function eventRow(
  id: string,
  sequence: number,
  createdAtOffset: number,
  effectId: string | null = null,
): LiveEventRow {
  const base = 1_000_000;
  return {
    id,
    creator_profile_id: "creator-1",
    overlay_id: "overlay-1",
    donation_id: `donation-${id}`,
    sequence,
    payload: {
      donation: {
        id: `donation-${id}`,
        tx_hash: "tx",
        donor_name: "Donor",
        donor_address: "addr",
        amount: "10000000",
        token: "token",
        message: null,
      },
      token_display: { contract_address: "token", symbol: "USDC", decimals: 7 },
      effect: effectId
        ? { pack_id: "startip.default", pack_version: "1.0.0", effect_id: effectId }
        : null,
    },
    status: "queued",
    expires_at: new Date(base + 30_000).toISOString(),
    created_at: new Date(base + createdAtOffset).toISOString(),
  };
}

describe("LiveEventClient", () => {
  let now = 1_000_000;
  let mock: MockFactory;
  let acks: { overlayId: string; eventId: string; status: string }[];

  beforeEach(() => {
    vi.useFakeTimers();
    now = 1_000_000;
    mock = createMockFactory();
    acks = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function client(): LiveEventClient {
    return new LiveEventClient({
      overlayId: "overlay-1",
      channelFactory: mock.factory,
      clock: { now: () => now },
      random: { random: () => 0 },
      boundarySkewMs: 5000,
      initialReconnectDelayMs: 1000,
      maxReconnectDelayMs: 30000,
      jitterMaxMs: 0,
      onAck: (overlayId, eventId, status) =>
        acks.push({ overlayId, eventId, status }),
    });
  }

  it("starts disconnected and becomes ready when the channel subscribes", () => {
    const states: LiveEventClientState[] = [];
    const c = client();
    c.subscribe((s) => states.push(s));

    c.start();

    expect(states.at(-1)?.status).toBe("connecting");

    mock.simulateStatus("SUBSCRIBED");

    expect(states.at(-1)?.status).toBe("ready");
    expect(mock.createCount()).toBe(1);
  });

  it("enqueues received events and exposes the active event and queue length", () => {
    const c = client();
    c.start();
    mock.simulateStatus("SUBSCRIBED");

    mock.simulateInsert(eventRow("a", 1, 0, null));
    mock.simulateInsert(eventRow("b", 2, 0, null));

    const state = c.getState();
    expect(state.activeEvent?.id).toBe("a");
    expect(state.queueLength).toBe(1);
  });

  it("ignores events inserted before the live boundary", () => {
    const c = client();
    c.start();
    mock.simulateStatus("SUBSCRIBED");

    // The boundary is now - 5000 = 995000. Older events are missed.
    mock.simulateInsert(eventRow("old", 1, -10_000, null));

    expect(c.getState().activeEvent).toBeNull();

    mock.simulateInsert(eventRow("new", 2, 0, null));

    expect(c.getState().activeEvent?.id).toBe("new");
  });

  it("reconnects with exponential backoff after connection loss", () => {
    const c = client();
    c.start();
    mock.simulateStatus("SUBSCRIBED");

    mock.simulateStatus("CLOSED");
    expect(c.getState().status).toBe("connection-lost");
    expect(mock.createCount()).toBe(1);

    // First retry at base delay.
    vi.advanceTimersByTime(1000);
    expect(mock.createCount()).toBe(2);

    mock.simulateStatus("CLOSED");
    vi.advanceTimersByTime(2000);
    expect(mock.createCount()).toBe(3);

    mock.simulateStatus("CLOSED");
    vi.advanceTimersByTime(4000);
    expect(mock.createCount()).toBe(4);

    // Successful reconnect resets the backoff.
    mock.simulateStatus("SUBSCRIBED");
    expect(c.getState().status).toBe("ready");

    mock.simulateStatus("CLOSED");
    vi.advanceTimersByTime(1000);
    expect(mock.createCount()).toBe(5);
  });

  it("reconnects immediately and resets backoff when reconnectNow is called", () => {
    const c = client();
    c.start();
    mock.simulateStatus("SUBSCRIBED");

    mock.simulateStatus("CLOSED");
    expect(c.getState().status).toBe("connection-lost");

    c.reconnectNow();
    expect(c.getState().status).toBe("connecting");
    expect(mock.createCount()).toBe(2);

    mock.simulateStatus("SUBSCRIBED");
    expect(c.getState().status).toBe("ready");

    // Backoff is reset: next failure should retry at base delay.
    mock.simulateStatus("CLOSED");
    vi.advanceTimersByTime(1000);
    expect(mock.createCount()).toBe(3);
  });

  it("emergency stop clears queued effects and stops the active effect", () => {
    const c = client();
    c.start();
    mock.simulateStatus("SUBSCRIBED");

    mock.simulateInsert(eventRow("effect-1", 1, 0, "jump-scare"));
    mock.simulateInsert(eventRow("alert-1", 2, 0, null));
    mock.simulateInsert(eventRow("effect-2", 3, 0, "screen-flash"));

    expect(c.getState().activeEvent?.id).toBe("effect-1");
    expect(c.getState().queueLength).toBe(2);

    c.emergencyStop();

    const state = c.getState();
    expect(state.activeEvent?.id).toBe("alert-1");
    expect(state.activeEvent?.payload.effect).toBeNull();
    expect(state.queueLength).toBe(0);
    expect(acks).toContainEqual({
      overlayId: "overlay-1",
      eventId: "effect-1",
      status: "stopped",
    });
    expect(acks).toContainEqual({
      overlayId: "overlay-1",
      eventId: "effect-2",
      status: "stopped",
    });
    expect(acks).not.toContainEqual({
      overlayId: "overlay-1",
      eventId: "alert-1",
      status: "stopped",
    });
  });

  it("leaves an active alert running during emergency stop", () => {
    const c = client();
    c.start();
    mock.simulateStatus("SUBSCRIBED");

    mock.simulateInsert(eventRow("alert-1", 1, 0, null));
    mock.simulateInsert(eventRow("effect-1", 2, 0, "jump-scare"));

    expect(c.getState().activeEvent?.id).toBe("alert-1");

    c.emergencyStop();

    const state = c.getState();
    expect(state.activeEvent?.id).toBe("alert-1");
    expect(state.queueLength).toBe(0);
  });

  it("does not acknowledge local test events", () => {
    const c = client();
    c.start();
    mock.simulateStatus("SUBSCRIBED");

    const item: LiveEventQueueItem = {
      id: "local-test",
      sequence: 1,
      expiresAt: new Date(now + 60_000).toISOString(),
      overlayId: "overlay-1",
      local: true,
      payload: {
        donation: {
          id: "local-test",
          tx_hash: "tx",
          donor_name: "Test",
          donor_address: "addr",
          amount: "0",
          token: "token",
          message: null,
        },
        token_display: { contract_address: "token", symbol: "USDC", decimals: 7 },
        effect: null,
      },
    };

    c.enqueueLocal(item);
    c.completeActive(now);

    expect(acks).toHaveLength(0);
  });

  it("sends lifecycle acknowledgements for server events", () => {
    const c = client();
    c.start();
    mock.simulateStatus("SUBSCRIBED");

    mock.simulateInsert(eventRow("a", 1, 0, null));
    c.completeActive(now);

    expect(acks).toEqual([
      { overlayId: "overlay-1", eventId: "a", status: "started" },
      { overlayId: "overlay-1", eventId: "a", status: "completed" },
    ]);
  });

  it("stops reconnecting after stop is called", () => {
    const c = client();
    c.start();
    mock.simulateStatus("SUBSCRIBED");

    mock.simulateStatus("CLOSED");
    expect(c.getState().status).toBe("connection-lost");

    c.stop();
    expect(c.getState().status).toBe("disconnected");

    vi.advanceTimersByTime(30_000);
    expect(mock.createCount()).toBe(1);
  });
});
