"use client";

import * as React from "react";
import { UserRoundIcon } from "lucide-react";
import { Grain } from "@/components/landing/grain";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

type ProfileStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

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
  const [displayName, setDisplayName] = React.useState(
    creatorProfile.display_name,
  );
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(
    creatorProfile.avatar_url,
  );
  const [profileStatus, setProfileStatus] = React.useState<ProfileStatus>({
    kind: "idle",
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  async function saveProfile() {
    setProfileStatus({ kind: "saving" });
    try {
      const supabase = createBrowserClient();
      let nextAvatarUrl = avatarUrl;

      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const ext = file.name.split(".").pop() ?? "png";
        const path = `${creatorProfile.user_id}/${Date.now()}.${ext}`;
        const up = await supabase.storage.from("avatars").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (up.error) throw up.error;
        nextAvatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      const update: { display_name: string; avatar_url?: string | null } = {
        display_name: displayName.trim() || "Anonymous",
      };
      if (nextAvatarUrl !== creatorProfile.avatar_url) {
        update.avatar_url = nextAvatarUrl;
      }

      const res = await supabase
        .from("profiles")
        .update(update)
        .eq("user_id", creatorProfile.user_id);
      if (res.error) throw res.error;

      setDisplayName(update.display_name);
      setAvatarUrl(nextAvatarUrl);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setProfileStatus({ kind: "saved" });
    } catch (e) {
      let message = "Could not save profile.";
      if (e instanceof Error && e.message) {
        message = e.message;
      } else if (
        e &&
        typeof e === "object" &&
        "message" in e &&
        typeof (e as { message: unknown }).message === "string"
      ) {
        message = (e as { message: string }).message;
      }
      setProfileStatus({ kind: "error", message });
    }
  }

  const donorCount = donorData?.donations.length ?? 0;
  const identity = useIdentity(creatorProfile);

  return (
    <>
      <Grain />
      <section className="dashboard relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-20 sm:px-6 sm:pb-20 sm:pt-24">
        <header className="dashboard-overview">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <IdentityAvatar
                avatarUrl={avatarUrl}
                name={displayName}
              />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
                  Dashboard
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {displayName}
                  </h1>
                  <ProfileEditDialog
                    avatarUrl={avatarUrl}
                    displayName={displayName}
                    fileInputRef={fileInputRef}
                    status={profileStatus}
                    onDisplayNameChange={(next) => {
                      setDisplayName(next);
                      setProfileStatus({ kind: "idle" });
                    }}
                    onSave={saveProfile}
                  />
                </div>
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
            <div className="dashboard-stat-strip">
              <DashboardStat label="Donations" value={String(donorCount)} />
              <DashboardStat
                label="Global rank"
                value={
                  donorData?.globalRank.rank
                    ? `#${donorData.globalRank.rank}`
                    : "Unranked"
                }
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 border-t border-foreground/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
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
            <p className="max-w-sm text-sm text-muted-foreground">
              {active === "donor"
                ? "Track donations, ranks, and the identity shown on leaderboards."
                : "Manage onboarding, payout, moderation, and creator tools."}
            </p>
          </div>
        </header>

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

function DashboardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="dashboard-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProfileEditDialog({
  avatarUrl,
  displayName,
  fileInputRef,
  status,
  onDisplayNameChange,
  onSave,
}: {
  avatarUrl: string | null;
  displayName: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  status: ProfileStatus;
  onDisplayNameChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Edit profile">
          <UserRoundIcon aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit your profile</DialogTitle>
          <DialogDescription>
            Your display name appears on donations and leaderboards. Your avatar
            is shown next to your name.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                width={56}
                height={56}
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div
                aria-hidden
                className="h-14 w-14 rounded-full bg-foreground/10"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label
                className="text-xs text-muted-foreground"
                htmlFor="avatar-input"
              >
                Avatar
              </label>
              <input
                id="avatar-input"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-foreground/8 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
                data-testid="avatar-input"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="display-name-input"
            >
              Display name
            </label>
            <Input
              id="display-name-input"
              className="flex-1"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder="Anonymous"
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter className="items-start sm:items-center sm:justify-between">
          <div className="min-h-5">
            {status.kind === "saved" && (
              <p
                className="text-xs text-tertiary"
                aria-live="polite"
                data-testid="save-status"
              >
                Profile saved.
              </p>
            )}
            {status.kind === "error" && (
              <p
                className="text-xs text-destructive"
                aria-live="polite"
                role="alert"
                data-testid="save-status"
              >
                {status.message}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={status.kind === "saving"}
          >
            {status.kind === "saving" ? "Saving..." : "Save profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
