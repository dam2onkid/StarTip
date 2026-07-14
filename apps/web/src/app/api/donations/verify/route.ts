import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createServerClient } from "@/lib/supabase/server";

interface VerifyBody {
  tx_hash: string;
  message?: string | null;
  donor_name?: string;
}

/**
 * POST /api/donations/verify — proxy to the verify/indexer worker with optional
 * authenticated donor identity.
 *
 * Anonymous donors are still welcome; the route only resolves a Supabase session
 * when present. If the caller is logged in, the auth `user_id` is forwarded to
 * the worker so the `donations.user_id` column can be populated, which is what
 * the dashboard Donor tab uses for donation history and leaderboard ranks. The
 * donor's `display_name` (when set and not the default "Anonymous") is used in
 * place of an empty/anonymous body `donor_name` so public leaderboards show the
 * identity they configured in their profile.
 *
 * The worker authenticates the proxy via `Authorization: Bearer <WORKER_SECRET>`.
 * Rate-limited by IP at the deployment edge.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const input = body as VerifyBody;
  if (typeof input.tx_hash !== "string" || !input.tx_hash.trim()) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userId: string | undefined;
  let donorName = input.donor_name;

  if (user) {
    userId = user.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const displayName = profile?.display_name;
    if (
      typeof displayName === "string" &&
      displayName.trim() &&
      displayName.trim() !== "Anonymous"
    ) {
      donorName = displayName.trim();
    }
  }

  const workerRes = await fetch(new URL("/verify", env.WORKER_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.WORKER_SECRET}`,
    },
    body: JSON.stringify({
      tx_hash: input.tx_hash,
      message: input.message,
      donor_name: donorName,
      user_id: userId,
    }),
  });
  const workerBody = await workerRes.json();
  return NextResponse.json(workerBody, { status: workerRes.status });
}
