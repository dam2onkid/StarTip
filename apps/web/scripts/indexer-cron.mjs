#!/usr/bin/env node
/**
 * Local indexer cron — polls the Next.js dev server's
 * POST /api/indexer/poll endpoint on a fixed interval so the Supabase
 * mirror stays reconciled with on-chain DonationRouter events while
 * developing locally (where Vercel Cron does not run).
 *
 * Config via env:
 *   INDEXER_POLL_URL     full URL to the poll route
 *                        (default: http://localhost:3000/api/indexer/poll)
 *   INDEXER_POLL_MS      interval between polls in ms (default: 10000)
 *   INDEXER_TIMEOUT_MS   per-request timeout in ms (default: 30000)
 *   INDEXER_DEBUG        set to "1" to request ?debug=1 and log every
 *                        fetched event (topic / ledger / txHash / value)
 *                        plus full response headers and raw body.
 *
 * Usage:
 *   node web/scripts/indexer-cron.mjs
 *   INDEXER_POLL_MS=5000 node web/scripts/indexer-cron.mjs
 *   INDEXER_DEBUG=1 node web/scripts/indexer-cron.mjs
 *
 * Stops cleanly on SIGINT / SIGTERM.
 */
const BASE_URL =
  process.env.INDEXER_POLL_URL ?? "http://localhost:3000/api/indexer/poll";
const POLL_MS = Number(process.env.INDEXER_POLL_MS ?? 10_000);
const TIMEOUT_MS = Number(process.env.INDEXER_TIMEOUT_MS ?? 30_000);
const DEBUG = process.env.INDEXER_DEBUG === "1";

const POLL_URL = DEBUG
  ? `${BASE_URL}${BASE_URL.includes("?") ? "&" : "?"}debug=1`
  : BASE_URL;

const log = (level, msg, extra) => {
  const ts = new Date().toISOString();
  const line = extra
    ? `[${ts}] ${level} ${msg} ${JSON.stringify(extra)}`
    : `[${ts}] ${level} ${msg}`;
  console.log(line);
};

let running = true;
let inFlight = null;

const stop = (signal) => {
  if (!running) return;
  running = false;
  log("info", `received ${signal}, stopping after current poll`);
  if (inFlight && typeof inFlight.abort === "function") inFlight.abort();
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

async function pollOnce() {
  const controller = new AbortController();
  inFlight = controller;
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(POLL_URL, { method: "POST", signal: controller.signal });
    const text = await res.text();
    const elapsedMs = Date.now() - startedAt;

    if (DEBUG) {
      const headers = Object.fromEntries(res.headers.entries());
      log("debug", "raw response", {
        status: res.status,
        statusText: res.statusText,
        elapsedMs,
        headers,
        rawBody: text,
      });
    }

    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      log("error", "response was not valid JSON", {
        status: res.status,
        rawBody: text,
      });
      return;
    }

    if (!res.ok) {
      log("error", "poll failed", { status: res.status, statusText: res.statusText, body });
      return;
    }

    const summary = {
      status: res.status,
      elapsedMs,
      processed: body?.processed,
      last_ledger: body?.last_ledger,
      cursor: body?.cursor,
      eventCount: Array.isArray(body?.events) ? body.events.length : 0,
    };
    log("info", "poll ok", summary);

    if (DEBUG && Array.isArray(body?.events)) {
      for (const ev of body.events) {
        log("debug", "event", {
          topic: ev.topic,
          ledger: ev.ledger,
          txHash: ev.txHash,
          value: ev.value,
        });
      }
    } else if (DEBUG) {
      log("debug", "no events field in response (route debug not enabled?)");
    }
  } catch (err) {
    if (err.name === "AbortError") {
      log("error", `poll timed out after ${TIMEOUT_MS}ms`);
    } else {
      log("error", "poll error", { message: err.message, stack: err.stack });
    }
  } finally {
    clearTimeout(timer);
    inFlight = null;
  }
}

async function loop() {
  log("info", "indexer cron started", {
    url: POLL_URL,
    intervalMs: POLL_MS,
    debug: DEBUG,
  });
  while (running) {
    await pollOnce();
    if (!running) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  log("info", "indexer cron stopped");
}

// Wire bigint-safe stringify into the log helper so event values with
// i128 amounts print as strings instead of throwing.
const _origStringify = JSON.stringify;
JSON.stringify = (value, replacer, space) =>
  _origStringify(
    value,
    replacer ?? ((_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    space,
  );

loop();
