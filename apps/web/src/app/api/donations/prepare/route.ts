import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { DEFAULT_EFFECT_IDS } from "@startip/shared/live-events/pricing";
import { defaultPackManifest } from "@startip/shared/overlay/default-pack";

interface PrepareBody {
  handle?: unknown;
  token?: unknown;
  amount?: unknown;
  effect_id?: unknown;
}

/**
 * POST /api/donations/prepare — create a single-use, expiring Effect Intent
 * before the donor signs the on-chain donation.
 *
 * The server generates a unique donation preparation identity, binds the
 * Creator, token, raw minimum amount, Default Pack id/version, effect id, and
 * expiry, then forwards the request to the worker's authoritative effect-intent
 * creation endpoint. The response carries the locked raw amount and the
 * preparation identity so the client can donate and verify with the same
 * binding.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const input = body as PrepareBody;
  if (typeof input.handle !== "string" || !input.handle.trim()) {
    return NextResponse.json({ error: "missing_handle" }, { status: 400 });
  }
  if (typeof input.token !== "string" || !input.token.trim()) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  if (typeof input.effect_id !== "string" || !input.effect_id.trim()) {
    return NextResponse.json({ error: "missing_effect_id" }, { status: 400 });
  }
  if (!(DEFAULT_EFFECT_IDS as ReadonlyArray<string>).includes(input.effect_id)) {
    return NextResponse.json({ error: "invalid_effect" }, { status: 400 });
  }

  const num = Number(input.amount);
  if (!Number.isFinite(num) || num <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const donationPrepId = crypto.randomUUID();

  const workerRes = await fetch(new URL("/live-events/effect-intents", env.WORKER_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.WORKER_SECRET}`,
    },
    body: JSON.stringify({
      handle: input.handle.trim().toLowerCase(),
      token: input.token.trim(),
      amount: String(num),
      effect_id: input.effect_id,
      pack_id: defaultPackManifest.id,
      pack_version: defaultPackManifest.version,
      donation_prep_id: donationPrepId,
    }),
  });

  const workerBody = (await workerRes.json()) as { error?: string; effect_intent_id?: string; raw_amount?: string; expires_at?: string };
  if (!workerRes.ok) {
    return NextResponse.json(workerBody, { status: workerRes.status });
  }

  return NextResponse.json(
    {
      donation_prep_id: donationPrepId,
      effect_intent_id: workerBody.effect_intent_id,
      raw_amount: workerBody.raw_amount,
      expires_at: workerBody.expires_at,
      pack_id: defaultPackManifest.id,
      pack_version: defaultPackManifest.version,
      effect_id: input.effect_id,
    },
    { status: 201 },
  );
}
