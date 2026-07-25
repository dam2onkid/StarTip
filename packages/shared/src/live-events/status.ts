/**
 * Shared Live Event lifecycle status vocabulary.
 *
 * Keep the canonical set of statuses in one place so the client, worker, and
 * web app cannot drift.
 */

export type LifecycleStatus =
  | "queued"
  | "started"
  | "completed"
  | "failed"
  | "stopped"
  | "missed"
  | "expired";

export const LIVE_EVENT_STATUSES: LifecycleStatus[] = [
  "queued",
  "started",
  "completed",
  "failed",
  "stopped",
  "missed",
  "expired",
];

export const TERMINAL_LIVE_EVENT_STATUSES: LifecycleStatus[] = [
  "completed",
  "failed",
  "stopped",
  "missed",
  "expired",
];

/**
 * Statuses the Live Event Client is allowed to acknowledge. `missed` is
 * server-owned (set by the expiry sweep), so it is not accepted from clients.
 */
export const ACK_LIVE_EVENT_STATUSES: Exclude<LifecycleStatus, "queued" | "missed">[] = [
  "started",
  "completed",
  "failed",
  "stopped",
  "expired",
];

export function isTerminalLiveEventStatus(status: LifecycleStatus): boolean {
  return TERMINAL_LIVE_EVENT_STATUSES.includes(status);
}
