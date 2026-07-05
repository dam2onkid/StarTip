import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  verifyDonation,
  type VerifyDeps,
  type VerifyInput,
  type VerifyResult,
  type VerifyPendingBody,
} from "@startip/shared/donations/confirm";

/**
 * Hono app serving `POST /verify`. The Next.js app proxies here (ADR-0006).
 *
 * The endpoint polls `verifyDonation` (which calls `rpc.getTransaction`)
 * every `pollIntervalMs` up to `pollMaxMs`. On 404 (tx not yet visible) it
 * retries; when the poll window expires it returns 202 so the client falls
 * back to Supabase Realtime and the indexer catches the row.
 *
 * Auth: `Authorization: Bearer <secret>`.
 */

export interface VerifyAppDeps {
  service: SupabaseClient;
  rpc: VerifyDeps["rpc"];
  contractId: string;
}

export interface VerifyAppOptions {
  pollMaxMs: number;
  pollIntervalMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `verifyDonation` until it returns a non-404 result or the poll window
 * expires. On window expiry with the tx still NOT_FOUND, returns 202
 * `{ status: "pending" }` so the client subscribes to Realtime and the
 * indexer catches the row.
 */
export async function pollVerify(
  deps: VerifyAppDeps,
  input: VerifyInput,
  pollMaxMs: number,
  pollIntervalMs: number,
): Promise<VerifyResult> {
  const start = Date.now();
  for (;;) {
    const result = await verifyDonation(deps, input);
    // 404 = tx not yet visible. Anything else (200, 409, 500) is terminal.
    if (result.status !== 404) return result;

    if (Date.now() - start >= pollMaxMs) {
      return { status: 202, body: { status: "pending" } as VerifyPendingBody };
    }
    await sleep(pollIntervalMs);
  }
}

export function createVerifyApp(
  deps: VerifyAppDeps,
  options: VerifyAppOptions,
  secret: string,
): Hono {
  const app = new Hono();

  app.post("/verify", async (c) => {
    // 1. Auth.
    const auth = c.req.header("authorization");
    if (auth !== `Bearer ${secret}`) {
      return c.json({ error: "unauthorized" }, 401);
    }

    // 2. Body.
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    const input = body as VerifyInput;
    if (typeof input?.tx_hash !== "string" || !input.tx_hash.trim()) {
      return c.json({ error: "invalid_body" }, 400);
    }

    // 3. Poll.
    const result = await pollVerify(
      deps,
      input,
      options.pollMaxMs,
      options.pollIntervalMs,
    );
    return c.json(result.body, result.status as 200 | 202 | 401 | 404 | 409 | 500);
  });

  return app;
}
