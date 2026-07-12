import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateLeaderboard,
  sumDonationStats,
  type LeaderboardRow,
} from "@/lib/creators/leaderboard";
import { goalProgress, type GoalDonationRow } from "@/lib/creators/goal";

/**
 * Creator dashboard stats loader for the `/dashboard` Creator tab active
 * features.
 *
 * The Creator's received donations are read via the creator RLS path
 * (`donations_creator_select`: `auth.uid() = profiles.user_id` join on
 * `creator_profile_id`), which exposes ALL columns of the Creator's received
 * donations, including hidden ones and pending rows. The session client
 * (carrying the user's JWT) is passed in so RLS applies; the service role is
 * not needed here because the creator is reading their own donations.
 *
 * Stats (total received, count) aggregate confirmed/indexed donations
 * INCLUDING hidden ones (the Creator sees their full picture). The per-creator
 * leaderboard aggregates only visible confirmed/indexed donations with
 * logged-in donors (matching the public per-creator leaderboard on
 * `/creator/[handle]`). `recent` is the raw row list in newest-first order,
 * including hidden and pending rows, for the moderation list.
 */

/** A received-donation row as read via the creator RLS path (all columns). */
export interface CreatorDonationRow {
  id: string;
  donor_name: string;
  amount: string;
  token: string;
  message: string | null;
  donor_address: string | null;
  user_id: string | null;
  status: string;
  moderation_status: string;
  created_at: string;
}

export interface CreatorStats {
  total: string;
  count: number;
  /** SAC contract address for the aggregated total; the UI uses this to pick the token's decimals/symbol. */
  token?: string;
}

export interface CreatorDashboardData {
  stats: CreatorStats;
  leaderboard: { donor_name: string; total_amount: string; token?: string }[];
  recent: CreatorDonationRow[];
  /** Precomputed donation-goal progress snapshot, or `null` when no goal is set. */
  goal: { current: string; target: string; pct: number; token: string } | null;
}

const CONFIRMED_STATUSES = ["confirmed", "indexed"];

/**
 * Load the Creator's dashboard data (stats, leaderboard, recent donations)
 * via the creator RLS path. The supabase client must carry the Creator's
 * session so the `donations_creator_select` policy applies.
 */
export async function loadCreatorDashboardData(
  supabase: SupabaseClient,
  creatorProfileId: string,
): Promise<CreatorDashboardData> {
  const { data } = await supabase
    .from("donations")
    .select(
      "id,donor_name,amount,token,message,donor_address,user_id,status,moderation_status,created_at",
    )
    .eq("creator_profile_id", creatorProfileId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as CreatorDonationRow[];

  // Stats: confirmed/indexed donations, including hidden.
  const statsRows = rows
    .filter((r) => CONFIRMED_STATUSES.includes(r.status))
    .map((r) => ({ amount: r.amount, token: r.token }));
  const stats = sumDonationStats(statsRows);

  // Leaderboard: visible confirmed/indexed donations, logged-in donors only.
  const leaderboardRows: LeaderboardRow[] = rows
    .filter(
      (r) =>
        CONFIRMED_STATUSES.includes(r.status) && r.moderation_status === "visible",
    )
    .map((r) => ({
      donor_name: r.donor_name,
      amount: r.amount,
      user_id: r.user_id,
      token: r.token,
    }));
  const leaderboard = aggregateLeaderboard(leaderboardRows);

  // Donation goal: read the Creator's `donation_goals` row (public SELECT,
  // so the session client works) and compute progress from the visible
  // confirmed/indexed donations in the goal's token. No row = no goal.
  const { data: goalRow } = await supabase
    .from("donation_goals")
    .select("target_amount,token")
    .eq("creator_profile_id", creatorProfileId)
    .maybeSingle();
  const g = goalRow as { target_amount: string; token: string } | null;
  let goal: { current: string; target: string; pct: number; token: string } | null = null;
  if (g) {
    // Rebuild the goal-token donation set from the raw rows (the leaderboard
    // rows dropped `token`). Only visible confirmed/indexed rows contribute.
    const goalTokenRows: GoalDonationRow[] = rows
      .filter(
        (r) =>
          CONFIRMED_STATUSES.includes(r.status) &&
          r.moderation_status === "visible" &&
          r.token === g.token,
      )
      .map((r) => ({ token: r.token, amount: r.amount }));
    const progress = goalProgress(goalTokenRows, {
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

  return { stats, leaderboard, recent: rows, goal };
}
