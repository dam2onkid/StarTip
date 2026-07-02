import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import {
  aggregateLeaderboard,
  sumDonationStats,
  type LeaderboardRow,
} from "@/lib/creators/leaderboard";
import {
  isMockDataEnabled,
  getMockCreator,
  getMockDonations,
} from "@/lib/creators/mock";
import { ShareButtons } from "@/components/creator/share-buttons";
import { BackButton } from "@/components/creator/back-button";

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

  if (isMockDataEnabled()) {
    const creator = getMockCreator(normalized);
    if (!creator) notFound();
    const rows = getMockDonations(normalized) as LeaderboardRow[];
    const stats = sumDonationStats(rows);
    return (
      <CreatorPageShell
        handle={creator.handle}
        displayName={creator.display_name}
        avatarUrl={creator.avatar_url}
        bannerUrl={creator.banner_url}
        bio={creator.bio}
        total={stats.total}
        count={stats.count}
        leaderboard={aggregateLeaderboard(rows)}
      />
    );
  }

  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("id,handle,display_name,avatar_url,banner_url,bio,onchain_registered,paused")
    .eq("handle", normalized)
    .maybeSingle();

  const p = profile as {
    id: string;
    handle: string;
    display_name: string;
    avatar_url: string | null;
    banner_url: string | null;
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
      bannerUrl={p.banner_url}
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
  bannerUrl = null,
  bio,
  total,
  count,
  leaderboard,
}: {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** Cover image. When null/absent, the default atmospheric gradient is used. */
  bannerUrl?: string | null;
  bio: string | null;
  total: string;
  count: number;
  leaderboard: { donor_name: string; total_amount: string }[];
}) {
  return (
    <section className="relative w-full">
      {/* Banner (Twitter-style cover). Absolutely positioned and pulled up
          with a negative top + negative z-index so it slides BEHIND the
          transparent site nav (which is a static element and therefore paints
          in front of this negative-z layer). This removes the black strip that
          appeared above the banner and lets the cover reach the viewport top.
          Atmospheric gradient + grain + faint grid per DESIGN.md; no second hue
          is introduced, the lime accent stays reserved for the Donate CTA. */}
      <div className="absolute inset-x-0 -top-24 -z-10 h-72 overflow-hidden">
        {bannerUrl ? (
          <>
            {/* Creator-supplied cover image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bannerUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Mild overall tint so the identity stays legible over any image. */}
            <div aria-hidden className="absolute inset-0 bg-background/25" />
            {/* Top scrim: darkens the strip sitting behind the transparent nav
                so the nav links stay readable over a bright cover image. */}
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-background/90 via-background/50 to-transparent"
            />
          </>
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 18% 12%, color-mix(in oklch, var(--foreground) 14%, transparent) 0%, transparent 55%), radial-gradient(100% 80% at 88% 8%, color-mix(in oklch, var(--primary) 10%, transparent) 0%, transparent 50%), linear-gradient(180deg, #14171b 0%, #0e1013 100%)",
            }}
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundSize: "240px 240px",
          }}
        />
        {/* Faint grid lines for the engineering-grade texture. Only over the
            default gradient; an image cover provides its own texture. */}
        {!bannerUrl && (
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
              maskImage:
                "radial-gradient(ellipse 70% 60% at 30% 30%, black 20%, transparent 75%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 70% 60% at 30% 30%, black 20%, transparent 75%)",
            }}
          />
        )}
        {/* Bottom fade into the page neutral so the banner dissolves into the body. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background"
        />
      </div>

      {/* Back control, sitting on the cover just below the nav. */}
      <div className="mx-auto w-full max-w-4xl px-6 pt-6">
        <BackButton />
      </div>

      {/* Profile head: avatar overlapping the banner baseline + identity, bio,
          and share, exactly like a social profile. `pt-14` (below the Back row)
          places the avatar over the lower third of the 18rem banner. The avatar
          sits on top of the banner (normal flow, above the -z-10 cover) so
          nothing overlays it. */}
      <div className="mx-auto w-full max-w-4xl px-6 pt-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                width={112}
                height={112}
                className="h-28 w-28 rounded-full object-cover ring-4 ring-background"
              />
            ) : (
              <div
                aria-hidden
                className="h-28 w-28 rounded-full bg-card ring-4 ring-background"
              />
            )}
            <div className="flex flex-col gap-1.5 pb-1">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
                {displayName}
              </h1>
              <p className="font-mono text-sm text-muted-foreground">@{handle}</p>
            </div>
          </div>
          <ShareButtons displayName={displayName} className="shrink-0" />
        </div>
        {bio && (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {bio}
          </p>
        )}
      </div>

      {/* Body grid: max 2 columns. Left column stacks Stats + Support; the
          right column is the Top Donors leaderboard. The Donate CTA is the
          single Tertiary element at rest (DESIGN.md single-accent rule). */}
      <div className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          {/* Stats card */}
          <div className="flex flex-col gap-3 rounded-lg bg-card p-5 ring-1 ring-foreground/10">
            <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Stats
            </h2>
            <dl className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-muted-foreground">Total received</dt>
                <dd
                  className="font-mono text-lg text-foreground"
                  data-testid="total-received"
                >
                  {total}
                </dd>
              </div>
              <div className="h-px bg-foreground/10" />
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-muted-foreground">Donations</dt>
                <dd
                  className="font-mono text-lg text-foreground"
                  data-testid="donation-count"
                >
                  {count}
                </dd>
              </div>
            </dl>
          </div>

          {/* Donate CTA card, the single lime accent at rest */}
          <div className="flex flex-col gap-3 rounded-lg bg-card p-5 ring-1 ring-foreground/10">
            <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Support
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Send a Stellar asset directly to {displayName}. Settles in seconds, on-chain proof.
            </p>
            <a
              href={`/creator/${handle}/donate`}
              className="mt-auto inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              data-testid="donate-cta"
            >
              Donate to {handle}
            </a>
          </div>
        </div>

        {/* Leaderboard card */}
        <aside className="flex flex-col gap-3 rounded-lg bg-card p-5 ring-1 ring-foreground/10">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Top Donors
          </h2>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tracked donations yet. Be the first logged-in donor.
            </p>
          ) : (
            <ol className="flex flex-col gap-2" data-testid="creator-leaderboard">
              {leaderboard.map((entry, i) => (
                <li
                  key={entry.donor_name}
                  className="flex items-center justify-between rounded-md bg-background/40 px-3 py-2 ring-1 ring-foreground/5"
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
