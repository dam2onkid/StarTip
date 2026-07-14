import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@startip/shared/supabase/service";
import { env } from "@/lib/env";
import { createRateLimiter } from "@/lib/rate-limit";

/**
 * POST /api/tts - public proxy from the Overlay to the Worker's synthesize
 * endpoint.
 *
 * The Overlay has no session, so the route identifies the caller by a
 * per-Creator `overlay_id`. It resolves the opaque Overlay ID to a registered,
 * not-paused Creator profile, enforces a per-Overlay-ID rate limit, attaches
 * the Worker secret server-side, and forwards `{ text, voice }` to the Worker.
 * Audio bytes and Worker errors are passed through unchanged.
 */

const ttsRateLimiter = createRateLimiter({
  maxRequests: env.TTS_RATE_LIMIT_MAX_REQUESTS,
  windowMs: env.TTS_RATE_LIMIT_WINDOW_MS,
});

const TTS_PROXY_TIMEOUT_MS = 15_000;

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
  const { text, voice } = body;

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

function isValidBody(
  body: unknown,
): body is { overlay_id: string; text: string; voice: string } {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.overlay_id === "string" &&
    b.overlay_id.trim().length > 0 &&
    typeof b.text === "string" &&
    b.text.length > 0 &&
    typeof b.voice === "string" &&
    b.voice.length > 0
  );
}
