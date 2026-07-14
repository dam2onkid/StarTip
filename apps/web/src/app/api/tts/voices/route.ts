import { NextResponse, type NextRequest } from "next/server";
import { requireAuthedProfile } from "@/lib/auth/context";
import { env } from "@/lib/env";

/**
 * GET /api/tts/voices - authenticated proxy to the Worker's voice list.
 *
 * The dashboard's Voice picker uses this route to list the Voices the current
 * Text-to-Speech Provider supports. The Worker secret is attached server-side;
 * the browser never sees it. The optional `locale` query parameter is forwarded
 * to the Worker.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuthedProfile();
  if (!auth.ok) return auth.response;

  const locale = request.nextUrl.searchParams.get("locale") ?? undefined;

  const workerUrl = new URL(`${env.WORKER_URL}/tts/voices`);
  if (locale) {
    workerUrl.searchParams.set("locale", locale);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const workerRes = await fetch(workerUrl, {
      headers: {
        authorization: `Bearer ${env.WORKER_SECRET}`,
      },
      signal: controller.signal,
    });

    const body = await workerRes.json();
    return NextResponse.json(body, { status: workerRes.status });
  } catch {
    return NextResponse.json({ error: "voices_unavailable" }, { status: 504 });
  } finally {
    clearTimeout(timeoutId);
  }
}
