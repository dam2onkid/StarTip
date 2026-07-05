import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rpc } from "@/lib/stellar/server";
import { contractId } from "@/lib/stellar/client";
import { confirmDonation, type ConfirmInput } from "@/lib/donations/confirm";

/**
 * POST /api/donations/confirm — verify the on-chain tx + `DonationReceived`
 * event, upsert the donation by `tx_hash` as `confirmed`, and promote an
 * `indexed` row to `confirmed` (ADR-0003 fast path).
 *
 * No auth required. Rate-limited by IP at the deployment edge. Body:
 * `{ tx_hash, donation_id }`. See `lib/donations/confirm.ts` for the full
 * contract.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const input = body as ConfirmInput;
  const service = createServiceClient();
  const result = await confirmDonation({ service, rpc, contractId }, input);
  return NextResponse.json(result.body, { status: result.status });
}
