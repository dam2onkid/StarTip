import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rpc } from "@/lib/stellar/server";
import { readTokenMetadata } from "@/lib/stellar/token";
import { contractId } from "@/lib/stellar/client";
import { env } from "@/lib/env";
import { processPoll } from "@/lib/indexer/dispatch";

/**
 * POST /api/indexer/poll — cron-driven reconcile job. Scans every
 * DonationRouter event from a single shared cursor and mirrors all event types
 * into Supabase: DonationReceived, CreatorRegistered, CreatorPayoutUpdated,
 * CreatorActiveChanged, TokenAllowlistUpdated. Idempotent; safe to call on
 * overlapping ledger ranges.
 *
 * Intended to be invoked by Vercel Cron or an external scheduler at a ~5-10s
 * interval. Returns a small summary so the scheduler can log progress.
 */
export async function POST(request?: Request) {
  try {
    const debug =
      request !== undefined &&
      new URL(request.url).searchParams.get("debug") === "1";
    const supabase = createServiceClient();
    const result = await processPoll(
      {
        supabase,
        rpc,
        tokenReader: readTokenMetadata,
        contractId,
        startLedger: env.INDEXER_START_LEDGER,
      },
      { debug },
    );
    return NextResponse.json({
      processed: result.processed,
      last_ledger: result.lastLedger,
      cursor: result.cursor,
      ...(debug ? { events: result.debug ?? [] } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "indexer poll failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
