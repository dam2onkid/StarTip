/**
 * Shared Live Event FIFO queue.
 *
 * The queue maintains the durable Creator-scoped Live Event sequence for a
 * single client session. Events are consumed in ascending sequence, one active
 * event at a time, and every event reaches a stable forward-only lifecycle
 * outcome. Rendering is notified through state subscriptions; acknowledgement
 * traffic is best-effort and never blocks rendering.
 */

import type { LifecycleStatus } from "./status";
import { isTerminalLiveEventStatus } from "./status";

export type { LifecycleStatus } from "./status";

export interface QueueItem {
  id: string;
  sequence: number;
  expiresAt: string;
}

export interface Clock {
  now(): number;
}

export interface LiveEventQueueState<T extends QueueItem> {
  active: { item: T; status: "started"; startedAt: number } | null;
  queue: T[];
  terminal: { item: T; status: Exclude<LifecycleStatus, "queued" | "started"> }[];
}

export interface LiveEventQueueOptions<T extends QueueItem> {
  clock: Clock;
  onAck: (item: T, status: LifecycleStatus) => void;
}

interface ItemState<T extends QueueItem> {
  item: T;
  status: LifecycleStatus;
  startedAt: number | null;
}

function parseTimestamp(iso: string): number {
  return new Date(iso).getTime();
}

function defaultClock(): Clock {
  return { now: () => Date.now() };
}

export class LiveEventQueue<T extends QueueItem> {
  private clock: Clock;
  private onAck: (item: T, status: LifecycleStatus) => void;
  private items = new Map<string, ItemState<T>>();
  private queueOrder: string[] = [];
  private activeId: string | null = null;
  private terminalOrder: string[] = [];
  private dirty = false;
  private listeners = new Set<(state: LiveEventQueueState<T>) => void>();

  constructor(options: Partial<LiveEventQueueOptions<T>> = {}) {
    this.clock = options.clock ?? defaultClock();
    this.onAck = options.onAck ?? (() => {});
  }

  getState(): LiveEventQueueState<T> {
    const active = this.activeId ? this.items.get(this.activeId) ?? null : null;
    const queue = this.queueOrder
      .map((id) => this.items.get(id))
      .filter((state): state is ItemState<T> => state?.status === "queued")
      .map((state) => state.item);

    const terminal = this.terminalOrder
      .map((id) => this.items.get(id))
      .filter(
        (state): state is ItemState<T> & { status: Exclude<LifecycleStatus, "queued" | "started"> } =>
          state !== undefined && isTerminalLiveEventStatus(state.status),
      )
      .map((state) => ({ item: state.item, status: state.status }));

    return {
      active: active
        ? { item: active.item, status: "started", startedAt: active.startedAt ?? 0 }
        : null,
      queue,
      terminal,
    };
  }

  subscribe(listener: (state: LiveEventQueueState<T>) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  enqueue(item: T): boolean {
    if (this.items.has(item.id)) {
      return false;
    }

    this.items.set(item.id, {
      item,
      status: "queued",
      startedAt: null,
    });
    this.insertBySequence(item.id);
    this.dirty = true;

    this.tick();
    return true;
  }

  tick(now?: number): void {
    const time = now ?? this.clock.now();
    this.expireQueued(time);
    this.startNext(time);
    this.emitIfDirty();
  }

  completeActive(now?: number): boolean {
    return this.resolveActive("completed", now);
  }

  failActive(now?: number): boolean {
    return this.resolveActive("failed", now);
  }

  stopActive(now?: number): boolean {
    return this.resolveActive("stopped", now);
  }

  /**
   * Remove queued items matching the predicate and transition them to
   * `stopped`. The active item is not affected. Returns the number of items
   * removed.
   */
  clear(predicate: (item: T) => boolean): number {
    let removed = 0;
    for (const id of [...this.queueOrder]) {
      const state = this.items.get(id);
      if (!state || state.status !== "queued") continue;
      if (predicate(state.item)) {
        this.removeFromQueue(id);
        this.transition(state, "stopped");
        removed += 1;
      }
    }
    this.emitIfDirty();
    return removed;
  }

  private insertBySequence(id: string): void {
    const item = this.items.get(id);
    if (!item) return;

    const index = this.queueOrder.findIndex(
      (queuedId) => (this.items.get(queuedId)?.item.sequence ?? Number.POSITIVE_INFINITY) > item.item.sequence,
    );
    if (index === -1) {
      this.queueOrder.push(id);
    } else {
      this.queueOrder.splice(index, 0, id);
    }
  }

  private expireIfOverdue(state: ItemState<T>, now: number): boolean {
    if (now > parseTimestamp(state.item.expiresAt)) {
      this.removeFromQueue(state.item.id);
      this.transition(state, "expired");
      return true;
    }
    return false;
  }

  private expireQueued(now: number): void {
    for (const id of [...this.queueOrder]) {
      const state = this.items.get(id);
      if (!state || state.status !== "queued") continue;
      this.expireIfOverdue(state, now);
    }
  }

  private startNext(now: number): void {
    if (this.activeId !== null) return;

    for (const id of [...this.queueOrder]) {
      const state = this.items.get(id);
      if (!state || state.status !== "queued") continue;

      if (this.expireIfOverdue(state, now)) {
        continue;
      }

      this.removeFromQueue(id);
      state.status = "started";
      state.startedAt = now;
      this.activeId = id;
      this.dirty = true;
      this.onAck(state.item, "started");
      return;
    }
  }

  private resolveActive(
    status: Exclude<LifecycleStatus, "queued" | "started" | "missed">,
    now?: number,
  ): boolean {
    if (this.activeId === null) return false;

    const state = this.items.get(this.activeId);
    if (!state || state.status !== "started") return false;

    const time = now ?? this.clock.now();
    this.transition(state, status);
    this.activeId = null;
    this.dirty = true;
    this.tick(time);
    return true;
  }

  private transition(state: ItemState<T>, status: LifecycleStatus): void {
    state.status = status;
    if (isTerminalLiveEventStatus(status)) {
      this.terminalOrder.push(state.item.id);
    }
    this.onAck(state.item, status);
  }

  private removeFromQueue(id: string): void {
    this.queueOrder = this.queueOrder.filter((queuedId) => queuedId !== id);
    this.dirty = true;
  }

  private emitIfDirty(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.emit();
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
