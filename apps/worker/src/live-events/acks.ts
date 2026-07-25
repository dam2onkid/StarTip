import { Hono } from "hono";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Worker Live Events - lifecycle acknowledgements.
 *
 * `POST /live-events/:event_id/ack` receives a lifecycle transition from a
 * Live Event Client (proxied by the Next.js app). The Worker verifies that the
 * event exists, applies forward-only lifecycle rules, and persists the
 * transition. Terminal states are idempotent; backward or conflicting
 * transitions are rejected.
 */

export interface LiveEventsAckDeps {
  service: SupabaseClient;
}

const ackInputSchema = z.object({
  status: z.enum(["started", "completed", "failed", "stopped", "expired"]),
});

export type AckInput = z.infer<typeof ackInputSchema>;

export interface AckSuccessBody {
  id: string;
  status: string;
}

export interface AckErrorBody {
  error: string;
}

export type AckResult =
  | { status: 200; body: AckSuccessBody }
  | { status: 400 | 401 | 404 | 409 | 500; body: AckErrorBody };

interface LiveEventRow {
  id: string;
  status: string;
  expires_at: string;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "stopped", "missed", "expired"]);
const TERMINAL_ACK_STATUSES = new Set(["completed", "failed", "stopped", "expired"]);

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

function isTerminalAck(status: string): status is "completed" | "failed" | "stopped" | "expired" {
  return TERMINAL_ACK_STATUSES.has(status);
}

export async function ackLiveEvent(
  deps: LiveEventsAckDeps,
  eventId: string,
  input: AckInput,
): Promise<AckResult> {
  const parsed = ackInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid_body" } };
  }
  const { status } = parsed.data;

  const { data: event, error: selectErr } = await deps.service
    .from("live_events")
    .select("id,status,expires_at")
    .eq("id", eventId)
    .maybeSingle();
  if (selectErr) {
    return { status: 500, body: { error: "db_error" } };
  }
  if (!event) {
    return { status: 404, body: { error: "event_not_found" } };
  }

  const row = event as LiveEventRow;

  if (isTerminal(row.status)) {
    return row.status === status
      ? { status: 200, body: { id: row.id, status: row.status } }
      : { status: 409, body: { error: "already_terminal" } };
  }

  if (status === "started") {
    if (row.status === "queued") {
      if (new Date() > new Date(row.expires_at)) {
        return { status: 409, body: { error: "event_expired" } };
      }
      return updateStatus(deps, eventId, status);
    }
    return row.status === "started"
      ? { status: 200, body: { id: row.id, status: row.status } }
      : { status: 409, body: { error: "invalid_transition" } };
  }

  if (status === "expired") {
    if (row.status !== "queued") {
      return { status: 409, body: { error: "invalid_transition" } };
    }
    return updateStatus(deps, eventId, status);
  }

  if (isTerminalAck(status)) {
    if (row.status === "queued" && status !== "stopped") {
      return { status: 409, body: { error: "invalid_transition" } };
    }
    if (row.status === "started" || (row.status === "queued" && status === "stopped")) {
      return updateStatus(deps, eventId, status);
    }
    return { status: 409, body: { error: "invalid_transition" } };
  }

  return { status: 400, body: { error: "invalid_body" } };
}

async function updateStatus(
  deps: LiveEventsAckDeps,
  eventId: string,
  status: AckInput["status"],
): Promise<AckResult> {
  const update: Record<string, unknown> = { status };
  if (status === "started") {
    update.ack_started_at = new Date().toISOString();
  } else {
    update.ack_terminal_at = new Date().toISOString();
  }

  const { error: updateErr } = await deps.service
    .from("live_events")
    .update(update)
    .eq("id", eventId);
  if (updateErr) {
    return { status: 500, body: { error: "db_error" } };
  }

  return { status: 200, body: { id: eventId, status } };
}

const ackParamsSchema = z.object({
  event_id: z.string().min(1),
});

export function createLiveEventsAckApp(deps: LiveEventsAckDeps, secret: string): Hono {
  const app = new Hono();

  app.post("/live-events/:event_id/ack", async (c) => {
    const auth = c.req.header("authorization");
    if (auth !== `Bearer ${secret}`) {
      return c.json({ error: "unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }

    const paramsParsed = ackParamsSchema.safeParse(c.req.param());
    if (!paramsParsed.success) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const inputParsed = ackInputSchema.safeParse(body);
    if (!inputParsed.success) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const result = await ackLiveEvent(deps, paramsParsed.data.event_id, inputParsed.data);
    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 409 | 500);
  });

  return app;
}
