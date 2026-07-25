import type { SupabaseClient } from "@supabase/supabase-js";

import { LiveEventQueue, defaultClock, parseTimestamp, type Clock, type QueueItem } from "./queue";
import type { LifecycleStatus } from "./status";

export type ClientConnectionStatus =
  | "disconnected"
  | "connecting"
  | "ready"
  | "connection-lost";

export interface LiveEventEffect {
  pack_id: string;
  pack_version: string;
  effect_id: string;
}

export interface LiveEventDonation {
  id: string;
  tx_hash: string;
  donor_name: string;
  donor_address: string;
  amount: string;
  token: string;
  message: string | null;
}

export interface LiveEventTokenDisplay {
  contract_address: string;
  symbol: string;
  decimals: number;
}

export interface LiveEventPayload {
  donation: LiveEventDonation;
  token_display: LiveEventTokenDisplay;
  effect: LiveEventEffect | null;
}

export interface LiveEventRow {
  id: string;
  creator_profile_id: string;
  overlay_id: string;
  donation_id: string;
  sequence: number;
  payload: LiveEventPayload;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface LiveEventQueueItem extends QueueItem {
  overlayId: string;
  payload: LiveEventPayload;
  local?: boolean;
}

export interface LiveEventClientState {
  status: ClientConnectionStatus;
  activeEvent: LiveEventQueueItem | null;
  queueLength: number;
  lastError: string | null;
}

export interface RandomSource {
  random(): number;
}

export interface RealtimeChannelStatus {
  status: string;
}

export interface LiveEventChannel {
  subscribe(onStatus: (status: RealtimeChannelStatus) => void): () => void;
}

export interface LiveEventChannelFactory {
  createChannel(
    overlayId: string,
    onInsert: (row: LiveEventRow) => void,
  ): LiveEventChannel;
}

export interface LiveEventClientOptions {
  overlayId: string;
  channelFactory: LiveEventChannelFactory;
  clock?: Clock;
  random?: RandomSource;
  boundarySkewMs?: number;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  jitterMaxMs?: number;
  onAck?: (overlayId: string, eventId: string, status: LifecycleStatus) => void;
  onState?: (state: LiveEventClientState) => void;
}

function defaultRandom(): RandomSource {
  return { random: () => Math.random() };
}

export function createSupabaseChannelFactory(
  client: SupabaseClient,
): LiveEventChannelFactory {
  return {
    createChannel(overlayId, onInsert) {
      const channel = client
        .channel("live-events")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "live_events",
            filter: `overlay_id=eq.${overlayId}`,
          },
          (payload: { new: LiveEventRow }) => {
            onInsert(payload.new);
          },
        );

      return {
        subscribe(onStatus) {
          channel.subscribe((status: string) => {
            onStatus({ status });
          });
          return () => {
            void client.removeChannel(channel);
          };
        },
      };
    },
  };
}

/**
 * Client-side Live Event connection manager.
 *
 * Owns the Supabase Realtime channel lifecycle, reconnect backoff, the active
 * live boundary, and the local event queue. Emits normalized state for the
 * Control Window and feeds events to the overlay renderer.
 */
export class LiveEventClient {
  private options: Required<
    Pick<
      LiveEventClientOptions,
      | "boundarySkewMs"
      | "initialReconnectDelayMs"
      | "maxReconnectDelayMs"
      | "jitterMaxMs"
    >
  > &
    LiveEventClientOptions;
  private queue: LiveEventQueue<LiveEventQueueItem>;
  private clock: Clock;
  private random: RandomSource;

  private status: ClientConnectionStatus = "disconnected";
  private activeEvent: LiveEventQueueItem | null = null;
  private queueLength = 0;
  private lastError: string | null = null;

  private unsubscribeChannel: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 1;
  private boundary = 0;
  private stopped = false;

  private listeners = new Set<(state: LiveEventClientState) => void>();

  constructor(options: LiveEventClientOptions) {
    this.options = {
      boundarySkewMs: 5000,
      initialReconnectDelayMs: 1000,
      maxReconnectDelayMs: 30000,
      jitterMaxMs: 1000,
      ...options,
    };

    this.clock = this.options.clock ?? defaultClock();
    this.random = this.options.random ?? defaultRandom();

    this.queue = new LiveEventQueue<LiveEventQueueItem>({
      clock: this.clock,
      onAck: (item, status) => this.handleAck(item, status),
    });

    this.queue.subscribe((state) => {
      this.activeEvent = state.active?.item ?? null;
      this.queueLength = state.queue.length;
      this.emit();
    });
  }

  start(): void {
    if (!this.stopped && this.status !== "disconnected" && this.status !== "connection-lost") {
      return;
    }
    this.stopped = false;
    this.cancelReconnect();
    this.startTicking();
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.cancelReconnect();
    this.stopTicking();
    this.disconnect();
    this.setStatus("disconnected");
  }

  reconnectNow(): void {
    if (this.stopped) return;
    this.cancelReconnect();
    this.disconnect();
    this.reconnectAttempt = 1;
    this.connect();
  }

  emergencyStop(): void {
    const now = this.clock.now();
    this.queue.clear((item) => item.payload.effect !== null, "expired");

    const active = this.queue.getState().active?.item;
    if (active && active.payload.effect !== null) {
      this.queue.stopActive(now);
    } else if (!active) {
      this.queue.tick(now);
    }
  }

  completeActive(now?: number): boolean {
    return this.queue.completeActive(now);
  }

  failActive(now?: number): boolean {
    return this.queue.failActive(now);
  }

  enqueueLocal(item: LiveEventQueueItem): boolean {
    return this.queue.enqueue(item);
  }

  getState(): LiveEventClientState {
    return {
      status: this.status,
      activeEvent: this.activeEvent,
      queueLength: this.queueLength,
      lastError: this.lastError,
    };
  }

  subscribe(listener: (state: LiveEventClientState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private connect(): void {
    this.boundary = this.clock.now() - this.options.boundarySkewMs;
    this.setStatus("connecting");

    const channel = this.options.channelFactory.createChannel(
      this.options.overlayId,
      (row) => this.onInsert(row),
    );

    this.unsubscribeChannel = channel.subscribe((status) =>
      this.onChannelStatus(status),
    );
  }

  private disconnect(): void {
    if (this.unsubscribeChannel) {
      this.unsubscribeChannel();
      this.unsubscribeChannel = null;
    }
  }

  private onInsert(row: LiveEventRow): void {
    const createdAt = parseTimestamp(row.created_at);
    if (createdAt < this.boundary) {
      return;
    }

    const item: LiveEventQueueItem = {
      id: row.id,
      sequence: row.sequence,
      expiresAt: row.expires_at,
      overlayId: row.overlay_id,
      payload: {
        donation: row.payload.donation,
        token_display: row.payload.token_display,
        effect: row.payload.effect,
      },
    };

    this.queue.enqueue(item);
  }

  private onChannelStatus(status: RealtimeChannelStatus): void {
    if (status.status === "SUBSCRIBED") {
      this.reconnectAttempt = 1;
      this.setStatus("ready");
      return;
    }

    this.handleConnectionLost(`channel ${status.status.toLowerCase()}`);
  }

  private handleConnectionLost(error?: string): void {
    if (this.stopped) return;
    this.disconnect();
    this.setStatus("connection-lost", error ?? null);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;

    const base = this.options.initialReconnectDelayMs;
    const cap = this.options.maxReconnectDelayMs;
    const exponent = Math.max(0, this.reconnectAttempt - 1);
    const jitter = Math.floor(this.random.random() * this.options.jitterMaxMs);
    const delay = Math.min(base * 2 ** exponent + jitter, cap);

    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) {
        this.connect();
      }
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startTicking(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      this.queue.tick();
    }, 1000);
  }

  private stopTicking(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private handleAck(item: LiveEventQueueItem, status: LifecycleStatus): void {
    if (item.local) return;
    this.options.onAck?.(item.overlayId, item.id, status);
  }

  private setStatus(status: ClientConnectionStatus, error: string | null = null): void {
    this.status = status;
    this.lastError = error;
    this.emit();
  }

  private emit(): void {
    const state = this.getState();
    this.options.onState?.(state);
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
