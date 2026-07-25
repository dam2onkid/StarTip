// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { LiveEventQueue } from "./queue";

/**
 * Shared Live Events - FIFO queue.
 *
 * These tests use a deterministic clock and externally observable queue state
 * to assert ordering, the 30-second start deadline, terminal lifecycle
 * transitions, idempotency, and that a failed effect advances the queue.
 */

interface TestItem {
  id: string;
  sequence: number;
  expiresAt: string;
}

const BASE = 1_000_000;
const DEADLINE_MS = 30_000;

function iso(offset: number): string {
  return new Date(BASE + offset).toISOString();
}

function item(id: string, sequence: number, expiresAtOffset: number = DEADLINE_MS): TestItem {
  return { id, sequence, expiresAt: iso(expiresAtOffset) };
}

function makeQueue(now: number, onAck = () => {}) {
  const clock = { now: () => now };
  return new LiveEventQueue<TestItem>({ clock, onAck: vi.fn(onAck) });
}

describe("LiveEventQueue", () => {
  it("starts the first queued event immediately and acks started", () => {
    const acks: { id: string; status: string }[] = [];
    let now = BASE;
    const queue = new LiveEventQueue<TestItem>({
      clock: { now: () => now },
      onAck: (item, status) => acks.push({ id: item.id, status }),
    });

    queue.enqueue(item("a", 1));

    const state = queue.getState();
    expect(state.active?.item.id).toBe("a");
    expect(state.active?.startedAt).toBe(BASE);
    expect(state.queue).toHaveLength(0);
    expect(acks).toEqual([{ id: "a", status: "started" }]);
  });

  it("queues events in ascending sequence and starts them one at a time", () => {
    let now = BASE;
    const queue = new LiveEventQueue<TestItem>({
      clock: { now: () => now },
      onAck: () => {},
    });

    queue.enqueue(item("a", 1));
    queue.enqueue(item("b", 2));

    const state = queue.getState();
    expect(state.active?.item.id).toBe("a");
    expect(state.queue.map((i) => i.id)).toEqual(["b"]);

    queue.completeActive();
    expect(queue.getState().active?.item.id).toBe("b");
    expect(queue.getState().queue).toHaveLength(0);
  });

  it("expires queued events held past their deadline without starting them", () => {
    let now = BASE;
    const acks: { id: string; status: string }[] = [];
    const queue = new LiveEventQueue<TestItem>({
      clock: { now: () => now },
      onAck: (item, status) => acks.push({ id: item.id, status }),
    });

    queue.enqueue(item("a", 1, DEADLINE_MS));
    queue.enqueue(item("b", 2, DEADLINE_MS));

    now = BASE + DEADLINE_MS + 1;
    queue.completeActive(now);

    const state = queue.getState();
    expect(state.active).toBeNull();
    expect(state.queue).toHaveLength(0);
    expect(state.terminal.map((t) => ({ id: t.item.id, status: t.status }))).toEqual([
      { id: "a", status: "completed" },
      { id: "b", status: "expired" },
    ]);
    expect(acks.filter((a) => a.id === "b")).toContainEqual({ id: "b", status: "expired" });
  });

  it("keeps an active event running even after its deadline passes", () => {
    let now = BASE;
    const queue = new LiveEventQueue<TestItem>({
      clock: { now: () => now },
      onAck: () => {},
    });

    queue.enqueue(item("a", 1, DEADLINE_MS));
    now = BASE + DEADLINE_MS + 1;
    queue.tick(now);

    expect(queue.getState().active?.item.id).toBe("a");
  });

  it("moves a failed effect to failed and advances to the next event", () => {
    let now = BASE;
    const acks: { id: string; status: string }[] = [];
    const queue = new LiveEventQueue<TestItem>({
      clock: { now: () => now },
      onAck: (item, status) => acks.push({ id: item.id, status }),
    });

    queue.enqueue(item("a", 1));
    queue.enqueue(item("b", 2));

    queue.failActive();

    const state = queue.getState();
    expect(state.active?.item.id).toBe("b");
    expect(state.terminal).toEqual([{ item: state.terminal[0].item, status: "failed" }]);
    expect(acks).toEqual([
      { id: "a", status: "started" },
      { id: "a", status: "failed" },
      { id: "b", status: "started" },
    ]);
  });

  it("supports stopped as a terminal transition", () => {
    let now = BASE;
    const queue = new LiveEventQueue<TestItem>({
      clock: { now: () => now },
      onAck: () => {},
    });

    queue.enqueue(item("a", 1));
    queue.stopActive();

    const state = queue.getState();
    expect(state.active).toBeNull();
    expect(state.terminal[0].status).toBe("stopped");
  });

  it("is idempotent on duplicate events with the same id", () => {
    let now = BASE;
    const queue = new LiveEventQueue<TestItem>({
      clock: { now: () => now },
      onAck: () => {},
    });

    expect(queue.enqueue(item("a", 1))).toBe(true);
    expect(queue.enqueue(item("a", 1))).toBe(false);

    expect(queue.getState().active?.item.id).toBe("a");
  });

  it("notifies subscribers with the current state on subscription and on every change", () => {
    let now = BASE;
    const queue = new LiveEventQueue<TestItem>({
      clock: { now: () => now },
      onAck: () => {},
    });

    const states: { activeId: string | null; queueLength: number }[] = [];
    const unsubscribe = queue.subscribe((state) => {
      states.push({ activeId: state.active?.item.id ?? null, queueLength: state.queue.length });
    });

    queue.enqueue(item("a", 1));
    queue.enqueue(item("b", 2));
    queue.completeActive();
    unsubscribe();

    expect(states).toEqual([
      { activeId: null, queueLength: 0 },
      { activeId: "a", queueLength: 0 },
      { activeId: "a", queueLength: 1 },
      { activeId: "b", queueLength: 0 },
    ]);
  });
});
