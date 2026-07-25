import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

const ACK_STATUS_VALUES = new Set(["started", "completed", "failed", "stopped", "expired"]);
const ACK_PROXY_TIMEOUT_MS = 10_000;

interface RouteContext {
  params: Promise<{ event_id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { event_id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ACK_PROXY_TIMEOUT_MS);

  try {
    const workerRes = await fetch(
      new URL(`/live-events/${event_id}/ack`, env.WORKER_URL),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.WORKER_SECRET}`,
        },
        body: JSON.stringify({ status: body.status }),
        signal: controller.signal,
      },
    );

    return new NextResponse(workerRes.body, {
      status: workerRes.status,
      headers: {
        "content-type":
          workerRes.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return NextResponse.json({ error: "ack_unavailable" }, { status: 504 });
  } finally {
    clearTimeout(timeoutId);
  }
}

function isValidBody(body: unknown): body is { status: string } {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.status === "string" &&
    b.status.trim().length > 0 &&
    ACK_STATUS_VALUES.has(b.status)
  );
}
