"use client";

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { buildTokenMap, getTokenDisplay } from "@/lib/donations/token";
import type { TokenAllowlistEntry } from "@/lib/donations/token";
import { CardTitleWithInfo, AddressRow, EmptyState } from "../shared";
import type { CreatorActiveData, CreatorProfile } from "../types";

export function CreatorStatusCard({ current }: { current: CreatorProfile }) {
  const paused = current.paused ?? false;
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Creator Status"
          info="This is the availability donors see when they visit your page."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-xs text-muted-foreground">
        <p className="creator-address-row" data-testid="onchain-paused">
          <span>Status</span>
          <span className="status-pill" data-tone={paused ? "paused" : "active"}>
            <span className="dot" aria-hidden />
            {paused ? "Paused" : "Active"}
          </span>
        </p>
        <p className="creator-address-row" data-testid="onchain-registered">
          <span>On-chain registered</span>
          <span className="font-mono text-foreground">yes</span>
        </p>
        <AddressRow label="Wallet" value={current.owner_address} testId="onchain-owner" />
        <AddressRow
          label="Payout"
          value={current.payout_address ?? null}
          fallback="Not set"
          testId="onchain-payout"
        />
      </CardContent>
    </Card>
  );
}

/** Stats: total received and donation count (including hidden). */
export function StatsCard({
  activeData,
  tokens = [],
}: {
  activeData?: CreatorActiveData;
  tokens?: TokenAllowlistEntry[];
}) {
  const total = activeData?.stats.total ?? "0";
  const count = activeData?.stats.count ?? 0;
  const tokenMap = buildTokenMap(tokens);
  const display = getTokenDisplay(total, activeData?.stats.token, tokenMap);
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Stats"
          info="Total received and donation count, including hidden donations."
        />
      </CardHeader>
      <CardContent>
        <dl className="creator-stats-grid">
          <div className="creator-metric-tile">
            <dt className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
              Total received
            </dt>
            <dd className="stat-hero text-foreground" data-testid="creator-total-received">
              <span className="stat-hero-amount">{display.amount}</span>
              {display.symbol ? <span className="stat-hero-symbol">{display.symbol}</span> : null}
            </dd>
          </div>
          <div className="creator-metric-tile">
            <dt className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
              Donations
            </dt>
            <dd
              className="font-display text-3xl font-semibold tracking-tight text-foreground tabular-nums"
              data-testid="creator-donation-count"
            >
              {count}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/** Per-creator leaderboard: top Donors to this Creator (logged-in donors only). */
export function LeaderboardCard({
  activeData,
  tokens = [],
}: {
  activeData?: CreatorActiveData;
  tokens?: TokenAllowlistEntry[];
}) {
  const leaderboard = activeData?.leaderboard ?? [];
  const tokenMap = buildTokenMap(tokens);
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Top Donors"
          info="Your top donors, ranked by total donated. Anonymous donations are excluded."
        />
      </CardHeader>
      <CardContent>
        {leaderboard.length === 0 ? (
          <EmptyState
            eyebrow="No Supporters"
            message="Share your creator page to start building a ranked supporter list."
          />
        ) : (
          <ol className="flex flex-col gap-2" data-testid="creator-leaderboard">
            {leaderboard.map((entry, i) => {
              const display = getTokenDisplay(entry.total_amount, entry.token, tokenMap);
              return (
                <li
                  key={entry.donor_name + (entry.token ?? "")}
                  className="row-inset flex items-center justify-between px-3 py-2"
                >
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-medium text-foreground">{entry.donor_name}</span>
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {display.amount}
                    {display.symbol ? ` ${display.symbol}` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
