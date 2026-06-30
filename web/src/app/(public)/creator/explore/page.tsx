import { createServiceClient } from "@/lib/supabase/service";
import {
  aggregateLeaderboard,
  type LeaderboardRow,
} from "@/lib/creators/leaderboard";

/**
 * `/creator/explore` — public discovery surface. Lists active Creators
 * (registered + not paused, read from the `public_profiles` view) with their
 * display name, avatar, and Handle, each linking to `/creator/[handle]`.
 * Renders the Global Leaderboard: top Donors by aggregate donated amount
 * across all Creators, Donor Name + total amount. Only donations with a
 * non-null `user_id` (logged-in donors) contribute; anonymous donations are
 * excluded (PRD user stories 33-34).
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

export default async function ExplorePage() {
  const service = createServiceClient();

  const [{ data: creators, error: creatorsErr }, { data: donations, error: donationsErr }] =
    await Promise.all([
      service
        .from("public_profiles")
        .select("handle,display_name,avatar_url"),
      service
        .from("donations")
        .select("donor_name,amount,user_id")
        .in("status", ["confirmed", "indexed"])
        .eq("moderation_status", "visible"),
    ]);

  // A query error is not fatal to the whole page: render the section that
  // succeeded and surface a muted note for the failed one. Both being null
  // (empty) is a valid state.
  const creatorList = (creators ?? []) as {
    handle: string;
    display_name: string;
    avatar_url: string | null;
  }[];
  const leaderboard = creatorsErr || donationsErr
    ? []
    : aggregateLeaderboard((donations ?? []) as LeaderboardRow[]);

  return (
    <ExplorePageShell
      creators={creatorList}
      leaderboard={leaderboard}
      creatorsError={!!creatorsErr}
      leaderboardError={!!donationsErr}
    />
  );
}

export interface ExploreCreator {
  handle: string;
  display_name: string;
  avatar_url: string | null;
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
}: {
  creators: ExploreCreator[];
  leaderboard: { donor_name: string; total_amount: string }[];
  creatorsError?: boolean;
  leaderboardError?: boolean;
}) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pt-32 pb-24">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Explore Creators</h1>
        <p className="text-muted-foreground">
          Browse active Creators and the global donor leaderboard.
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">Active Creators</h2>
          {creatorsError ? (
            <p className="text-sm text-muted-foreground">
              Could not load Creators right now.
            </p>
          ) : creators.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Creators have registered yet. Check back soon.
            </p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="creator-list">
              {creators.map((creator) => (
                <li key={creator.handle}>
                  <a
                    href={`/creator/${creator.handle}`}
                    className="flex items-center gap-4 rounded-lg ring-1 ring-foreground/10 bg-card px-4 py-3 transition hover:ring-foreground/20"
                  >
                    {creator.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={creator.avatar_url}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="h-10 w-10 rounded-full bg-foreground/10"
                      />
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {creator.display_name}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        @{creator.handle}
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">Global Leaderboard</h2>
          {leaderboardError ? (
            <p className="text-sm text-muted-foreground">
              Could not load the leaderboard right now.
            </p>
          ) : leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tracked donations yet. Log in to donate and climb the board.
            </p>
          ) : (
            <ol className="flex flex-col gap-2" data-testid="global-leaderboard">
              {leaderboard.map((entry, i) => (
                <li
                  key={entry.donor_name}
                  className="flex items-center justify-between rounded-md bg-card px-3 py-2 ring-1 ring-foreground/10"
                >
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-medium text-foreground">{entry.donor_name}</span>
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {entry.total_amount}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </section>
  );
}
