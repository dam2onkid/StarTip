import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@startip/shared/supabase/service";
import {
  DashboardTabs,
  type DashboardTabsProps,
} from "@/app/(auth)/dashboard/dashboard-tabs";
import {
  type CreatorProfile,
  type CreatorActiveData,
} from "@/app/(auth)/dashboard/creator-tab";
import {
  type DonorProfile,
  type DonorDonation,
  type DonorPerCreatorRank,
} from "@/app/(auth)/dashboard/donor-tab";
import { computeDonorRank, type DonorRankRow } from "@/lib/donor/stats";
import {
  loadCreatorDashboardData,
  type CreatorDonationRow,
} from "@/lib/creators/creator-stats";

/**
 * `/dashboard` — authed shell for the `(auth)` route group.
 *
 * Reads the Supabase session via `lib/supabase/server.ts` and redirects to
 * `/login` when there is no user. Otherwise loads:
 *
 *   * the caller's Profile (Creator fields for the Creator tab; display_name +
 *     avatar_url for the Donor tab),
 *   * the caller's donation history via the donor RLS path
 *     (`auth.uid() = donations.user_id`), most recent first,
 *   * all confirmed/indexed visible donations (service role, for leaderboard
 *     rank computation — the donor RLS path only exposes the caller's own
 *     donations, so the global + per-creator ranks are computed server-side
 *     from the full donation set).
 *
 * Renders the tabbed shell: a Donor tab (default role) and a Creator tab that
 * runs the four-gate onboarding state machine inline.
 */
export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const service = createServiceClient();

  // Profile: Creator fields + Donor identity fields.
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id,user_id,display_name,avatar_url,bio,handle,owner_address,onchain_registered,payout_address,paused",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const p = profile as {
    id: string;
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    handle: string | null;
    owner_address: string | null;
    onchain_registered: boolean;
    payout_address?: string | null;
    paused: boolean;
  } | null;

  const creatorProfile: CreatorProfile = p
    ? {
        id: p.id,
        user_id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        bio: p.bio,
        handle: p.handle,
        owner_address: p.owner_address,
        onchain_registered: p.onchain_registered,
        payout_address: p.payout_address,
        paused: p.paused,
      }
    : // No profile row yet (should not happen — autocreate trigger) — start at
      // gate 1 with a synthetic id so Realtime can still attach if one appears.
      {
        id: "",
        user_id: user.id,
        display_name: "Anonymous",
        avatar_url: null,
        bio: null,
        handle: null,
        owner_address: null,
        onchain_registered: false,
        paused: false,
      };

  // Donation history via the donor RLS path (own donations, all columns).
  const { data: historyRows } = await supabase
    .from("donations")
    .select(
      "id,token,amount,message,donor_name,status,created_at,creator_profile_id",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const donations = (historyRows ?? []) as unknown as DonorDonation[];

  // All confirmed/indexed visible donations for rank computation (service role
  // bypasses RLS so the global + per-creator leaderboards can aggregate across
  // all donors). Anonymous donations (user_id null) are excluded by
  // computeDonorRank.
  const { data: allRows } = await service
    .from("donations")
    .select("donor_name,amount,user_id,creator_profile_id")
    .in("status", ["confirmed", "indexed"])
    .eq("moderation_status", "visible");
  const allDonations = (allRows ?? []) as DonorRankRow[];

  const globalRank = computeDonorRank(allDonations, user.id);

  // Per-creator ranks: for each creator the user has donated to, compute the
  // user's rank among all donors to that creator.
  const distinctCreatorIds = Array.from(
    new Set(donations.map((d) => d.creator_profile_id)),
  );
  let perCreatorRanks: DonorPerCreatorRank[] = [];
  if (distinctCreatorIds.length > 0) {
    const { data: creatorRows } = await service
      .from("profiles")
      .select("id,handle,display_name")
      .in("id", distinctCreatorIds);
    const creatorById = new Map(
      ((creatorRows ?? []) as { id: string; handle: string | null; display_name: string }[]).map(
        (c) => [c.id, c],
      ),
    );
    perCreatorRanks = distinctCreatorIds.map((cid) => {
      const rowsForCreator = allDonations.filter(
        (r) => r.creator_profile_id === cid,
      );
      const rank = computeDonorRank(rowsForCreator, user.id);
      const info = creatorById.get(cid);
      return {
        creator_profile_id: cid,
        handle: info?.handle ?? "",
        display_name: info?.display_name ?? "Unknown creator",
        rank: rank.rank,
        total: rank.total,
      };
    });
  }

  const donorData = p
    ? {
        profile: {
          id: p.id,
          user_id: p.user_id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
        } satisfies DonorProfile,
        donations,
        globalRank,
        perCreatorRanks,
      }
    : undefined;

  // Creator active-features data: when the profile is an on-chain registered
  // Creator, load the received donations via the creator RLS path (all
  // columns, including hidden) and derive stats + the per-creator leaderboard.
  // The session client carries the user's JWT so the donations_creator_select
  // policy applies; the service role is not needed for the Creator's own
  // donations.
  let creatorActiveData: CreatorActiveData | undefined;
  if (p && p.onchain_registered && p.handle) {
    const loaded = await loadCreatorDashboardData(supabase, p.id);
    creatorActiveData = {
      stats: loaded.stats,
      leaderboard: loaded.leaderboard,
      recent: loaded.recent as CreatorDonationRow[],
      goal: loaded.goal,
    };
  }

  return (
    <DashboardShell
      creatorProfile={creatorProfile}
      donorData={donorData}
      creatorActiveData={creatorActiveData}
    />
  );
}

/**
 * Presentational shell for the dashboard. Exported so tests can render the tab
 * structure without going through the async session gate. `creatorProfile` is
 * optional so the shell can render in a default `profile_pending` state.
 * `donorData` is optional so the shell can render without donor data (e.g.
 * before the profile exists).
 *
 * Delegates the interactive tab + identity header to the `DashboardTabs`
 * client component; this wrapper stays a server component so the async session
 * gate above can run server-side.
 */
export function DashboardShell({
  creatorProfile,
  donorData,
  creatorActiveData,
}: Omit<DashboardTabsProps, "creatorProfile"> & {
  creatorProfile?: CreatorProfile;
}) {
  const profile: CreatorProfile = creatorProfile ?? {
    id: "",
    user_id: "",
    display_name: "Anonymous",
    avatar_url: null,
    bio: null,
    handle: null,
    owner_address: null,
    onchain_registered: false,
    paused: false,
  };
  return (
    <DashboardTabs
      creatorProfile={profile}
      donorData={donorData}
      creatorActiveData={creatorActiveData}
    />
  );
}
