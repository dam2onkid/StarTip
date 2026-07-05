import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@startip/shared/supabase/service";
import { getPublicProfile } from "@/lib/creators/public-profile";

/**
 * GET /api/creators/[handle] — public Creator profile.
 *
 * No auth required. Returns the public fields (`handle`, `display_name`,
 * `avatar_url`, `bio`, `onchain_registered`) for a registered, not-paused
 * Creator, or 404 when the handle is unknown / not registered / paused. The
 * read goes through the `public_profiles` view via the service role so the
 * route works without a user session and never leaks owner-only columns.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const service = createServiceClient();
  const result = await getPublicProfile({ service }, handle);
  return NextResponse.json(result.body, { status: result.status });
}
