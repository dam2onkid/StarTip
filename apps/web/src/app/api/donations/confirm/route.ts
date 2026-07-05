import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@startip/shared/supabase/service";
import { rpc } from "@startip/shared/stellar/server";
import { contractId } from "@/lib/stellar/client";
import { verifyDonation, type VerifyInput } from "@startip/shared/donations/confirm";

/**
 * POST /api/donations/confirm — verify the on-chain tx + `DonationReceived`
 * event, upsert the donation by `tx_hash` as `confirmed`, and promote an
 * `indexed` row to `confirmed` (ADR-0005 verify path).
 *
 * Transitional: this route will be replaced by the verify proxy in issue 06.
 * The body shape `{ tx_hash, donation_id }` is accepted for backward compat
 * but `donation_id` is ignored (tx_hash is the sole key per ADR-0005).
 *
 * No auth required. Rate-limited by IP at the deployment edge.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const input = body as VerifyInput;
  const service = createServiceClient();
  const result = await verifyDonation({ service, rpc, contractId }, input);
  return NextResponse.json(result.body, { status: result.status });
}
