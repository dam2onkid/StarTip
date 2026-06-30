"use client";

import * as React from "react";
import { Grain } from "@/components/landing/grain";
import { LogoutButton } from "@/app/(auth)/dashboard/logout-button";
import {
  CreatorTab,
  type CreatorProfile,
  type CreatorActiveData,
} from "@/app/(auth)/dashboard/creator-tab";
import {
  DonorTab,
  type DonorProfile,
  type DonorDonation,
  type DonorPerCreatorRank,
} from "@/app/(auth)/dashboard/donor-tab";

/**
 * Interactive shell for `/dashboard`. Owns the active-tab state, the identity
 * header (avatar, display name, handle, on-chain status pill), and renders the
 * Donor / Creator panels with a real tab switch (the previous shell rendered
 * both panels at once with hardcoded `aria-selected`).
 *
 * Tab semantics follow the WAI-ARIA tabs pattern: arrow keys move focus between
 * tabs, the active tab is focusable, and only the active panel is mounted. The
 * active indicator is a positioned element that translates between tabs using
 * `transform` only (DESIGN.md: animate transform/opacity, never layout).
 *
 * Visual treatment comes from the `.dashboard` scope in `globals.css`: glass
 * cards, atmospheric depth, dimensional hover, and a single lime accent
 * reserved for the active tab indicator and the per-view primary CTA.
 */

type TabId = "donor" | "creator";

const TABS: { id: TabId; label: string }[] = [
  { id: "donor", label: "Donor" },
  { id: "creator", label: "Creator" },
];

export interface DashboardTabsProps {
  creatorProfile: CreatorProfile;
  donorData?: {
    profile: DonorProfile;
    donations: DonorDonation[];
    globalRank: { rank: number | null; total: string };
    perCreatorRanks: DonorPerCreatorRank[];
  };
  creatorActiveData?: CreatorActiveData;
}

export function DashboardTabs({
  creatorProfile,
  donorData,
  creatorActiveData,
}: DashboardTabsProps) {
  const [active, setActive] = React.useState<TabId>("donor");
  const tabRefs = React.useRef<Record<TabId, HTMLButtonElement | null>>({
    donor: null,
    creator: null,
  });
  const [indicatorStyle, setIndicatorStyle] = React.useState<
    { transform: string; width: string } | undefined
  >(undefined);

  // Position the active indicator under the selected tab. The indicator is
  // absolutely positioned inside `.tab-list`, and `btn.offsetLeft` is already
  // relative to `.tab-list` (its offsetParent), so we use it directly — no
  // subtraction needed. Transform/width only, never layout (DESIGN.md).
  const positionIndicator = React.useCallback((id: TabId) => {
    const btn = tabRefs.current[id];
    if (!btn) return;
    setIndicatorStyle({
      transform: `translateX(${btn.offsetLeft}px)`,
      width: `${btn.offsetWidth}px`,
    });
  }, []);

  // useLayoutEffect so the indicator is positioned before paint (no flash at
  // the wrong origin on first render or tab switch).
  React.useLayoutEffect(() => {
    positionIndicator(active);
  }, [active, positionIndicator]);

  React.useEffect(() => {
    const onResize = () => positionIndicator(active);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, positionIndicator]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const idx = TABS.findIndex((t) => t.id === active);
    const nextIdx =
      e.key === "ArrowRight"
        ? (idx + 1) % TABS.length
        : (idx - 1 + TABS.length) % TABS.length;
    const next = TABS[nextIdx].id;
    setActive(next);
    // Move focus to the newly active tab on arrow navigation.
    window.requestAnimationFrame(() => tabRefs.current[next]?.focus());
  }

  function selectTab(id: TabId) {
    setActive(id);
    tabRefs.current[id]?.focus();
  }

  const donorCount = donorData?.donations.length ?? 0;
  const identity = useIdentity(creatorProfile);

  return (
    <>
      <Grain />
      <section className="dashboard relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pt-20 sm:pt-24 pb-16 sm:pb-20">
        {/* Identity header */}
        <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <IdentityAvatar
              avatarUrl={creatorProfile.avatar_url}
              name={creatorProfile.display_name}
            />
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
                Dashboard
              </span>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {creatorProfile.display_name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {creatorProfile.handle && (
                  <span className="font-mono text-xs text-muted-foreground">
                    @{creatorProfile.handle}
                  </span>
                )}
                <StatusPill
                  tone={
                    identity.onchain
                      ? identity.paused
                        ? "paused"
                        : "active"
                      : "neutral"
                  }
                  label={
                    identity.onchain
                      ? identity.paused
                        ? "Paused"
                        : "Active"
                      : "Not registered"
                  }
                />
              </div>
            </div>
          </div>
          <LogoutButton />
        </header>

        {/* Tab list */}
        <div role="tablist" aria-label="Dashboard" className="flex">
          <div className="tab-list">
            <span
              className="tab-indicator"
              aria-hidden
              style={indicatorStyle}
            />
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                role="tab"
                id={`${t.id}-tab`}
                aria-selected={active === t.id}
                aria-controls={`${t.id}-panel`}
                tabIndex={active === t.id ? 0 : -1}
                onClick={() => selectTab(t.id)}
                onKeyDown={onKeyDown}
              >
                {t.label}
                {t.id === "donor" && donorCount > 0 && (
                  <span className="tab-count" aria-hidden>
                    {donorCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Active panel only (clean DOM, correct a11y) */}
        {active === "donor" ? (
          <div
            role="tabpanel"
            id="donor-panel"
            aria-labelledby="donor-tab"
            className="flex flex-col gap-4"
          >
            {donorData ? (
              <DonorTab
                profile={donorData.profile}
                donations={donorData.donations}
                globalRank={donorData.globalRank}
                perCreatorRanks={donorData.perCreatorRanks}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Donor tab placeholder: donation history, leaderboard rank, edit
                display name and avatar.
              </p>
            )}
          </div>
        ) : (
          <div role="tabpanel" id="creator-panel" aria-labelledby="creator-tab">
            <CreatorTab
              profile={creatorProfile}
              activeData={creatorActiveData}
            />
          </div>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */

function useIdentity(p: CreatorProfile): {
  onchain: boolean;
  paused: boolean;
} {
  return { onchain: p.onchain_registered, paused: p.paused ?? false };
}

function IdentityAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null;
  name: string;
}) {
  const initials = React.useMemo(() => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "·";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [name]);
  return (
    <div className="identity-avatar h-14 w-14 sm:h-16 sm:w-16" aria-hidden>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" width={64} height={64} className="h-full w-full" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full font-mono text-sm text-muted-foreground">
          {initials}
        </div>
      )}
      <span className="ring" />
    </div>
  );
}

function StatusPill({
  tone,
  label,
}: {
  tone: "active" | "paused" | "neutral";
  label: string;
}) {
  return (
    <span className="status-pill" data-tone={tone}>
      <span className="dot" aria-hidden />
      {label}
    </span>
  );
}
