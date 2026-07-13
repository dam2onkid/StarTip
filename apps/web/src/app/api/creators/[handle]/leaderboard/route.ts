import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@startip/shared/supabase/service";
import {
  aggregateLeaderboard,
  sumDonationStats,
  type LeaderboardRow,
  type LeaderboardEntry,
} from "@/lib/creators/leaderboard";
import { goalProgress, type GoalDonationRow } from "@/lib/creators/goal";

interface CreatorLeaderboardProfile {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  onchain_registered: boolean;
  paused: boolean;
}

interface CreatorLeaderboardStats {
  total: string;
  count: number;
  token?: string;
}

interface CreatorLeaderboardGoal {
  current: string;
  target: string;
  pct: number;
  token: string;
}

interface CreatorLeaderboardResponse {
  profile: CreatorLeaderboardProfile;
  stats: CreatorLeaderboardStats;
  leaderboard: LeaderboardEntry[];
  goal: CreatorLeaderboardGoal | null;
}

/**
 * GET /api/creators/[handle]/leaderboard — public Creator page data.
 *
 * Resolves the handle to a registered, not-paused Creator, then returns the
 * profile, donation stats, ranked donor leaderboard, and donation goal progress.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ handle: string }> },
): Promise<NextResponse> {
  const { handle } = await context.params;
  const normalized = handle.trim().toLowerCase();
  if (!normalized) {
    return NextResponse.json({ error: "missing_handle" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("id,handle,display_name,avatar_url,banner_url,bio,onchain_registered,paused")
    .eq("handle", normalized)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  const p = profile as CreatorLeaderboardProfile | null;
  if (!p || !p.onchain_registered || p.paused) {
    return NextResponse.json({ error: "creator_not_found" }, { status: 404 });
  }

  const { data: donations, error: donationsErr } = await service
    .from("donations")
    .select("donor_name,amount,user_id,token")
    .eq("creator_profile_id", p.id)
    .in("status", ["confirmed", "indexed"])
    .eq("moderation_status", "visible");
  if (donationsErr) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const rows = (donations ?? []) as LeaderboardRow[];
  const stats = sumDonationStats(rows);
  const leaderboard = aggregateLeaderboard(rows);

  const { data: goalRow, error: goalErr } = await service
    .from("donation_goals")
    .select("target_amount,token")
    .eq("creator_profile_id", p.id)
    .maybeSingle();
  if (goalErr) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  let goal: CreatorLeaderboardGoal | null = null;
  if (goalRow) {
    const g = goalRow as { target_amount: string; token: string };
    const goalDonations: GoalDonationRow[] = rows
      .filter((r): r is LeaderboardRow & { token: string } => r.token === g.token)
      .map((r) => ({ token: r.token, amount: r.amount }));
    const progress = goalProgress(goalDonations, {
      token: g.token,
      targetAmount: g.target_amount,
    });
    goal = {
      current: progress.current,
      target: progress.target,
      pct: progress.pct,
      token: g.token,
    };
  }

  const body: CreatorLeaderboardResponse = {
    profile: p,
    stats,
    leaderboard,
    goal,
  };
  return NextResponse.json(body, { status: 200 });
}
