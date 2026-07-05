import { createServiceClient } from "@startip/shared/supabase/service";
import {
  aggregateLeaderboard,
  type LeaderboardRow,
} from "@/lib/creators/leaderboard";
import {
  ExploreDiscovery,
  type ExploreDiscoveryCreator,
} from "@/components/discovery/explore-discovery";

/**
 * `/creator/explore` — public discovery surface. Lists active Creators
 * (registered + not paused, read from the `public_profiles` view) with their
 * display name, avatar, and Handle, each linking to `/creator/[handle]`.
 * Renders the Global Leaderboard: top Donors by aggregate donated amount
 * across all Creators, Donor Name + total amount. Only donations with a
 * non-null `user_id` (logged-in donors) contribute; anonymous donations are
 * excluded (PRD user stories 33-34).
 *
 * Search and sort live client-side in `ExploreDiscovery` so the public route
 * keeps one compact discovery surface while still reading fresh server data.
 *
 * No auth required. Reads go through the service role so the page works
 * without a session and can aggregate `donations.user_id`, which the public
 * `public_donations` view does not expose.
 *
 * `force-dynamic` keeps the page server-rendered per request so the Creator
 * list and leaderboard always reflect live state instead of being baked at
 * build time.
 */
export const dynamic = "force-dynamic";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  const service = createServiceClient();

  const [{ data: creators, error: creatorsErr }, { data: donations, error: donationsErr }] =
    await Promise.all([
      service
        .from("public_profiles")
        .select("handle,display_name,avatar_url,bio"),
      service
        .from("donations")
        .select("donor_name,amount,user_id")
        .in("status", ["confirmed", "indexed"])
        .eq("moderation_status", "visible"),
    ]);

  // A query error is not fatal to the whole page: render the section that
  // succeeded and surface a muted note for the failed one. Both being null
  // (empty) is a valid state.
  const creatorList = (creators ?? []) as ExploreDiscoveryCreator[];
  const leaderboard = creatorsErr || donationsErr
    ? []
    : aggregateLeaderboard((donations ?? []) as LeaderboardRow[]);

  return (
    <ExplorePageShell
      creators={creatorList}
      leaderboard={leaderboard}
      creatorsError={!!creatorsErr}
      leaderboardError={!!donationsErr}
      searchQuery={q}
    />
  );
}

export interface ExploreCreator {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio?: string | null;
}

/**
 * Presentational shell for the explore page. Exported so tests can render the
 * structure without going through the async service-role data fetch.
 */
export function ExplorePageShell({
  creators,
  leaderboard,
  creatorsError = false,
  leaderboardError = false,
  searchQuery = "",
}: {
  creators: ExploreCreator[];
  leaderboard: { donor_name: string; total_amount: string }[];
  creatorsError?: boolean;
  leaderboardError?: boolean;
  searchQuery?: string;
}) {
  return (
    <ExploreDiscovery
      creators={creators as ExploreDiscoveryCreator[]}
      leaderboard={leaderboard}
      creatorsError={creatorsError}
      leaderboardError={leaderboardError}
      searchQuery={searchQuery}
    />
  );
}
