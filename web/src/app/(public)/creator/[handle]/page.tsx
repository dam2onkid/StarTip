import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import {
  aggregateLeaderboard,
  sumDonationStats,
  type LeaderboardRow,
} from "@/lib/creators/leaderboard";

/**
 * `/creator/[handle]` — public Creator page. Renders the Creator's public
 * profile (display name, avatar, bio), donation stats (total received, count),
 * the per-creator leaderboard (top Donors to this Creator, logged-in donors
 * only), and a Donate CTA linking to `/creator/[handle]/donate`.
 *
 * No auth required. The Creator is found via the service role (bypasses RLS)
 * by handle, filtered to `onchain_registered = true AND paused = false` so
 * unknown / not-registered / paused handles 404. Stats and the leaderboard
 * read confirmed/indexed visible donations for the Creator.
 *
 * `params` is a Promise in Next.js 15; the async server component awaits it
 * directly (the donate page uses `React.use` because it is a sync component
 * rendering a client island). The presentational `CreatorPageShell` is
 * exported so tests can render the structure without a Next.js route context.
 */
export default async function CreatorPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const normalized = handle.trim().toLowerCase();
  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("id,handle,display_name,avatar_url,bio,onchain_registered,paused")
    .eq("handle", normalized)
    .maybeSingle();

  const p = profile as {
    id: string;
    handle: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    onchain_registered: boolean;
    paused: boolean;
  } | null;

  if (!p || !p.onchain_registered || p.paused) {
    notFound();
  }

  const { data: donations } = await service
    .from("donations")
    .select("donor_name,amount,user_id")
    .eq("creator_profile_id", p.id)
    .in("status", ["confirmed", "indexed"])
    .eq("moderation_status", "visible");

  const rows = (donations ?? []) as LeaderboardRow[];
  const stats = sumDonationStats(rows);
  const leaderboard = aggregateLeaderboard(rows);

  return (
    <CreatorPageShell
      handle={p.handle}
      displayName={p.display_name}
      avatarUrl={p.avatar_url}
      bio={p.bio}
      total={stats.total}
      count={stats.count}
      leaderboard={leaderboard}
    />
  );
}

/**
 * Presentational shell for the Creator public page. Exported so tests can
 * render the page structure without going through the async data fetch.
 */
export function CreatorPageShell({
  handle,
  displayName,
  avatarUrl,
  bio,
  total,
  count,
  leaderboard,
}: {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  total: string;
  count: number;
  leaderboard: { donor_name: string; total_amount: string }[];
}) {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-24">
      <header className="flex items-start gap-5">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            width={72}
            height={72}
            className="h-18 w-18 rounded-full object-cover"
          />
        ) : (
          <div aria-hidden className="h-18 w-18 rounded-full bg-foreground/10" />
        )}
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{displayName}</h1>
          <p className="font-mono text-sm text-muted-foreground">@{handle}</p>
          {bio && <p className="text-sm text-muted-foreground">{bio}</p>}
        </div>
      </header>

      <div className="grid gap-8 md:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">Stats</h2>
          <dl className="flex flex-col gap-2 rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between">
              <dt className="text-sm text-muted-foreground">Total received</dt>
              <dd className="font-mono text-sm text-foreground" data-testid="total-received">
                {total}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-sm text-muted-foreground">Donations</dt>
              <dd className="font-mono text-sm text-foreground" data-testid="donation-count">
                {count}
              </dd>
            </div>
          </dl>
          <a
            href={`/creator/${handle}/donate`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            data-testid="donate-cta"
          >
            Donate to {handle}
          </a>
        </div>

        <aside className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">Top Donors</h2>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tracked donations yet. Be the first logged-in donor.
            </p>
          ) : (
            <ol className="flex flex-col gap-2" data-testid="creator-leaderboard">
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
