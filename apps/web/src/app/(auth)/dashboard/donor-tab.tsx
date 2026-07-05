"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The Donor tab of `/dashboard`: a logged-in User sees their donation
 * history, their rank on the Global Leaderboard and on each Creator's
 * leaderboard. Profile editing is owned by the dashboard header so the user's
 * visible identity has a single source of truth.
 */

export interface DonorProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface DonorDonation {
  id: string;
  token: string;
  amount: string;
  message: string | null;
  donor_name: string;
  status: string;
  created_at: string;
  creator_profile_id: string;
}

export interface DonorPerCreatorRank {
  creator_profile_id: string;
  handle: string;
  display_name: string;
  rank: number | null;
  total: string;
}

export interface DonorTabProps {
  profile: DonorProfile;
  donations: DonorDonation[];
  globalRank: { rank: number | null; total: string };
  perCreatorRanks: DonorPerCreatorRank[];
}

export function DonorTab({
  donations,
  globalRank,
  perCreatorRanks,
}: DonorTabProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
      <Card className="lg:row-span-2">
        <CardHeader>
          <CardTitle>Donation history</CardTitle>
          <CardDescription>Your past donations, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {donations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have not donated yet. Browse creators and tip to appear here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="donor-history">
              {donations.map((d) => (
                <li
                  key={d.id}
                  className="row-inset flex items-center justify-between px-3 py-2"
                >
                  <span className="flex flex-col">
                    <span className="font-mono text-sm text-foreground">
                      {d.amount} {d.token}
                    </span>
                    {d.message && (
                      <span className="text-xs text-muted-foreground">{d.message}</span>
                    )}
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-xs text-muted-foreground">{d.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Global Leaderboard rank</CardTitle>
          <CardDescription>
            Your standing across all creators. Anonymous donations are excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {globalRank.rank === null ? (
            <p className="text-sm text-muted-foreground">
              No tracked donations yet. Log in to donate and climb the board.
            </p>
          ) : (
            <div className="flex flex-col gap-1" data-testid="global-rank">
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
                Your rank
              </span>
              <div className="flex items-baseline gap-2">
                <span className="stat-hero text-foreground">
                  #{globalRank.rank}
                </span>
                <span className="text-sm text-muted-foreground">
                  with {globalRank.total} donated
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-creator ranks</CardTitle>
          <CardDescription>
            Your standing with each creator you have donated to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {perCreatorRanks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Donate to a creator to see your rank with them.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="per-creator-ranks">
              {perCreatorRanks.map((r) => (
                <li
                  key={r.creator_profile_id}
                  className="row-inset flex items-center justify-between px-3 py-2"
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{r.display_name}</span>
                    <span className="font-mono text-xs text-muted-foreground">@{r.handle}</span>
                  </span>
                  {r.rank === null ? (
                    <span className="text-xs text-muted-foreground">No tracked donations</span>
                  ) : (
                    <span className="font-mono text-sm text-foreground">#{r.rank}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
