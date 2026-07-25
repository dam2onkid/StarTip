import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@startip/shared/supabase/service";
import { env } from "@/lib/env";
import { createRateLimiter } from "@/lib/rate-limit";
import { buildReadingText } from "@/lib/overlay/settings";

/**
 * POST /api/tts - public proxy from the Overlay to the Worker's synthesize
 * endpoint.
 *
 * The Overlay has no session, so the route identifies the caller by a
 * per-Creator `overlay_id`. It resolves the opaque Overlay ID to a registered,
 * not-paused Creator profile, enforces a per-Overlay-ID rate limit, attaches
 * the Worker secret server-side, and forwards `{ text, voice }` to the Worker.
 *
 * Two request shapes are supported:
 *   * `{ overlay_id, text, voice }` - legacy browser Overlay proxy.
 *   * `{ overlay_id, donation_id }` - Live Event Client proxy. The server
 *     builds the Alert Reading text from the verified Donation, the Creator's
 *     stored Voice, and the token metadata so the Worker never receives
 *     arbitrary client text.
 */

const ttsRateLimiter = createRateLimiter({
  maxRequests: env.TTS_RATE_LIMIT_MAX_REQUESTS,
  windowMs: env.TTS_RATE_LIMIT_WINDOW_MS,
});

const TTS_PROXY_TIMEOUT_MS = 15_000;

type TtsBody =
  | { overlay_id: string; text: string; voice: string }
  | { overlay_id: string; donation_id: string };

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const overlayId = body.overlay_id.trim();

  const service = createServiceClient();
  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("id,onchain_registered,paused")
    .eq("overlay_id", overlayId)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  const creatorProfile = profile as
    | { id: string; onchain_registered: boolean; paused: boolean }
    | null;
  if (
    !creatorProfile ||
    !creatorProfile.onchain_registered ||
    creatorProfile.paused
  ) {
    return NextResponse.json({ error: "creator_not_found" }, { status: 404 });
  }

  if (ttsRateLimiter.isRateLimited(overlayId)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let text: string;
  let voice: string;

  if ("donation_id" in body) {
    const resolved = await resolveDonationReading(service, creatorProfile.id, body);
    if (resolved.error !== null) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    text = resolved.text;
    voice = resolved.voice;
  } else {
    text = body.text;
    voice = body.voice;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTS_PROXY_TIMEOUT_MS);

  try {
    const workerRes = await fetch(new URL("/tts", env.WORKER_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.WORKER_SECRET}`,
      },
      body: JSON.stringify({ text, voice }),
      signal: controller.signal,
    });

    return new NextResponse(workerRes.body, {
      status: workerRes.status,
      headers: {
        "content-type":
          workerRes.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "synthesis_unavailable" },
      { status: 504 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

interface ResolveSuccess {
  error: null;
  text: string;
  voice: string;
  status: 200;
}

interface ResolveError {
  error: string;
  status: number;
  text?: never;
  voice?: never;
}

async function resolveDonationReading(
  service: ReturnType<typeof createServiceClient>,
  creatorProfileId: string,
  body: { donation_id: string },
): Promise<ResolveSuccess | ResolveError> {
  const { data: donation, error: donationErr } = await service
    .from("donations")
    .select("id,donor_name,amount,token,message,status")
    .eq("id", body.donation_id.trim())
    .eq("creator_profile_id", creatorProfileId)
    .maybeSingle();
  if (donationErr) {
    return { error: "db_error", status: 500 };
  }
  if (!donation) {
    return { error: "donation_not_found", status: 404 };
  }

  const { data: settings, error: settingsErr } = await service
    .from("overlay_settings")
    .select("tts_enabled,tts_voice")
    .eq("creator_profile_id", creatorProfileId)
    .maybeSingle();
  if (settingsErr) {
    return { error: "db_error", status: 500 };
  }

  const ttsVoice = settings?.tts_voice ?? null;
  const ttsEnabled = settings?.tts_enabled ?? false;

  if (!ttsEnabled || typeof ttsVoice !== "string" || !ttsVoice) {
    return { error: "tts_unconfigured", status: 400 };
  }

  const { data: tokenRow, error: tokenErr } = await service
    .from("tokens")
    .select("symbol,decimals")
    .eq("contract_address", donation.token as string)
    .maybeSingle();
  if (tokenErr) {
    return { error: "db_error", status: 500 };
  }

  const decimals = (tokenRow as { decimals?: number } | null)?.decimals ?? 0;
  const symbol = (tokenRow as { symbol?: string } | null)?.symbol ?? (donation.token as string);

  const reading = buildReadingText({
    donorName: donation.donor_name as string,
    amount: String(donation.amount),
    symbol,
    decimals,
    message: (donation.message as string | null) ?? null,
    voice: ttsVoice,
  });

  return { error: null, text: reading, voice: ttsVoice, status: 200 };
}

function isValidBody(body: unknown): body is TtsBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  if (typeof b.overlay_id !== "string" || b.overlay_id.trim().length === 0) {
    return false;
  }

  const hasDonationId = typeof b.donation_id === "string" && b.donation_id.trim().length > 0;
  const hasText = typeof b.text === "string" && b.text.length > 0;
  const hasVoice = typeof b.voice === "string" && b.voice.length > 0;

  if (hasDonationId) {
    return !hasText && !hasVoice;
  }

  return hasText && hasVoice;
}
