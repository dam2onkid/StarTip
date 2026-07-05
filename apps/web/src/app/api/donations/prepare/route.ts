import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@startip/shared/supabase/service";
import { contractId } from "@/lib/stellar/client";
import { prepareDonation, type PrepareInput } from "@/lib/donations/prepare";

/**
 * POST /api/donations/prepare — mint a donation_id + hash, insert a pending
 * `donations` row, and return the metadata the client needs to build the
 * `donate()` transaction.
 *
 * No auth required (anonymous donors welcome). Rate-limited by IP at the
 * deployment edge. Body: `{ handle, token, amount, message?, donor_name? }`.
 * See `lib/donations/prepare.ts` for the full contract.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const input = body as PrepareInput;
  const session = await createServerClient();
  const service = createServiceClient();
  const result = await prepareDonation({ service, session, contractId }, input);
  return NextResponse.json(result.body, { status: result.status });
}
