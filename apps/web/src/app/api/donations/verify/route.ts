import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * POST /api/donations/verify — thin proxy to the verify/indexer worker
 * (ADR-0006). The worker polls `rpc.getTransaction` until the tx is visible
 * or the poll window expires, then upserts the donation by `tx_hash` as
 * `confirmed` (ADR-0005: verify is the fast path, the indexer reconciles).
 *
 * No auth required (anonymous donors welcome). The worker authenticates the
 * proxy via `Authorization: Bearer <WORKER_SECRET>`. Rate-limited by IP at the
 * deployment edge. Body: `{ tx_hash, message?, donor_name? }`.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const workerRes = await fetch(`${env.WORKER_URL}/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.WORKER_SECRET}`,
    },
    body: JSON.stringify(body),
  });
  const workerBody = await workerRes.json();
  return NextResponse.json(workerBody, { status: workerRes.status });
}
