"use client";

import * as React from "react";
import { ImageIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { Grain } from "@/components/landing/grain";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
import { type TokenAllowlistEntry } from "@/lib/donations/token";

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
    globalRank: { rank: number | null; total: string; token?: string };
    perCreatorRanks: DonorPerCreatorRank[];
  };
  creatorActiveData?: CreatorActiveData;
  tokens?: TokenAllowlistEntry[];
}

export function DashboardTabs({
  creatorProfile,
  donorData,
  creatorActiveData,
  tokens = [],
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
  const [bannerUrl, setBannerUrl] = React.useState<string | null>(
    creatorProfile.banner_url ?? null,
  );
  const [bio, setBio] = React.useState(creatorProfile.bio ?? "");
  const [profileStatus, setProfileStatus] = React.useState<ProfileStatus>({
    kind: "idle",
  });
  // Local preview of a freshly picked file (before Save uploads it to
  // Supabase). `URL.createObjectURL` gives a blob: URL we can render
  // immediately so the dialog reflects the user's pick without a round-trip.
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const bannerInputRef = React.useRef<HTMLInputElement>(null);

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

  // Revoke pending blob URLs when they're replaced or the shell unmounts,
  // otherwise we leak a file descriptor per pick.
  React.useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    };
  }, [avatarPreview, bannerPreview]);

  function handleAvatarFileChange() {
    const file = fileInputRef.current?.files?.[0];
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
    setProfileStatus({ kind: "idle" });
  }

  function handleBannerFileChange() {
    const file = bannerInputRef.current?.files?.[0];
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerPreview(file ? URL.createObjectURL(file) : null);
    setProfileStatus({ kind: "idle" });
  }

  function clearPendingPreviews() {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setAvatarPreview(null);
    setBannerPreview(null);
  }

  async function saveProfile() {
    setProfileStatus({ kind: "saving" });
    try {
      const supabase = createBrowserClient();
      let nextAvatarUrl = avatarUrl;
      let nextBannerUrl = bannerUrl;

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
      const bannerFile = bannerInputRef.current?.files?.[0];
      if (bannerFile) {
        const ext = bannerFile.name.split(".").pop() ?? "png";
        const path = `${creatorProfile.user_id}/banner-${Date.now()}.${ext}`;
        const up = await supabase.storage.from("avatars").upload(path, bannerFile, {
          cacheControl: "3600",
          upsert: false,
        });
        if (up.error) throw up.error;
        nextBannerUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      const update: {
        display_name: string;
        bio: string;
        avatar_url?: string | null;
        banner_url?: string | null;
      } = {
        display_name: displayName.trim() || "Anonymous",
        bio: bio.trim(),
      };
      if (nextAvatarUrl !== creatorProfile.avatar_url) {
        update.avatar_url = nextAvatarUrl;
      }
      if (nextBannerUrl !== (creatorProfile.banner_url ?? null)) {
        update.banner_url = nextBannerUrl;
      }

      const res = await supabase
        .from("profiles")
        .update(update)
        .eq("user_id", creatorProfile.user_id);
      if (res.error) throw res.error;

      setDisplayName(update.display_name);
      setAvatarUrl(nextAvatarUrl);
      setBannerUrl(nextBannerUrl);
      setBio(update.bio);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (bannerInputRef.current) bannerInputRef.current.value = "";
      clearPendingPreviews();
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

  async function removeBackground() {
    setProfileStatus({ kind: "saving" });
    try {
      const supabase = createBrowserClient();
      const res = await supabase
        .from("profiles")
        .update({ banner_url: null })
        .eq("user_id", creatorProfile.user_id);
      if (res.error) throw res.error;
      setBannerUrl(null);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
      clearPendingPreviews();
      setProfileStatus({ kind: "saved" });
    } catch (e) {
      setProfileStatus({
        kind: "error",
        message: e instanceof Error && e.message ? e.message : "Could not remove background.",
      });
    }
  }

  const donorCount = donorData?.donations.length ?? 0;
  const editableCreatorProfile = React.useMemo<CreatorProfile>(
    () => ({
      ...creatorProfile,
      display_name: displayName,
      avatar_url: avatarUrl,
      banner_url: bannerUrl,
      bio,
    }),
    [avatarUrl, bannerUrl, bio, creatorProfile, displayName],
  );

  return (
    <>
      <Grain />
      <section className="dashboard relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-20 sm:px-6 sm:pb-20 sm:pt-24">
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
                    avatarPreview={avatarPreview}
                    bannerPreview={bannerPreview}
                    displayName={displayName}
                    fileInputRef={fileInputRef}
                    bannerInputRef={bannerInputRef}
                    status={profileStatus}
                    onDisplayNameChange={(next) => {
                      setDisplayName(next);
                      setProfileStatus({ kind: "idle" });
                    }}
                    bio={bio}
                    bannerUrl={bannerUrl}
                    onBioChange={(next) => {
                      setBio(next);
                      setProfileStatus({ kind: "idle" });
                    }}
                    onAvatarFileChange={handleAvatarFileChange}
                    onBannerFileChange={handleBannerFileChange}
                    onRemoveBackground={removeBackground}
                    onSave={saveProfile}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {creatorProfile.handle && (
                    <span className="font-mono text-xs text-muted-foreground">
                      @{creatorProfile.handle}
                    </span>
                  )}
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
                tokens={tokens}
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
              profile={editableCreatorProfile}
              activeData={creatorActiveData}
              tokens={tokens}
            />
          </div>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */

function IdentityAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null;
  name: string;
}) {
  const initials = React.useMemo(() => {
    return initialsForName(name, "·");
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
  avatarPreview,
  bannerPreview,
  bannerUrl,
  bio,
  displayName,
  fileInputRef,
  bannerInputRef,
  status,
  onBioChange,
  onDisplayNameChange,
  onAvatarFileChange,
  onBannerFileChange,
  onRemoveBackground,
  onSave,
}: {
  avatarUrl: string | null;
  avatarPreview: string | null;
  bannerPreview: string | null;
  bannerUrl: string | null;
  bio: string;
  displayName: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  bannerInputRef: React.RefObject<HTMLInputElement | null>;
  status: ProfileStatus;
  onBioChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onAvatarFileChange: () => void;
  onBannerFileChange: () => void;
  onRemoveBackground: () => void;
  onSave: () => void;
}) {
  // A pending local pick takes precedence over the saved URL so the dialog
  // reflects the user's selection immediately, before Save uploads it.
  const avatarSrc = avatarPreview ?? avatarUrl;
  const bannerSrc = bannerPreview ?? bannerUrl;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Edit creator profile">
          <PencilIcon aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent
        // `translate-none` cancels DialogContent's base `-translate-x-1/2
        // -translate-y-1/2` via tailwind-merge. Those compile to the
        // standalone CSS `translate` property, which composes independently
        // of `transform` — left uncanceled, that -50%/-50% offset stacked on
        // top of `.creator-profile-dialog`'s own transform-based centering
        // and shifted the dialog up and to the left instead of centering it.
        className="creator-profile-dialog translate-none"
        showCloseButton={false}
      >
        <div className="creator-profile-dialog-header">
          <DialogClose className="creator-profile-dialog-close" aria-label="Close">
            <XIcon aria-hidden />
          </DialogClose>
          <DialogTitle>Edit profile</DialogTitle>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onSave}
            loading={status.kind === "saving"}
            disabled={status.kind === "saving"}
            data-testid="creator-profile-save"
          >
            Save
          </Button>
        </div>
        <DialogDescription className="sr-only">
          Your display name, avatar, background, and bio appear on your public creator page.
        </DialogDescription>
        <div className="creator-profile-dialog-body">
          <div className="creator-profile-cover">
            {bannerSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerSrc}
                alt=""
                data-testid={bannerPreview ? "creator-background-preview" : undefined}
              />
            ) : (
              <div className="creator-background-fallback" aria-hidden />
            )}
            {bannerPreview && (
              <span className="creator-pending-badge" data-testid="creator-background-pending">
                New
              </span>
            )}
            <div className="creator-profile-cover-actions">
              <label className="creator-icon-action" htmlFor="creator-background-input">
                <ImageIcon aria-hidden />
                <span className="sr-only">Change background</span>
              </label>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={onRemoveBackground}
                loading={status.kind === "saving"}
                disabled={status.kind === "saving" || !bannerUrl}
                data-testid="creator-background-remove"
                aria-label="Remove background"
              >
                <Trash2Icon aria-hidden />
              </Button>
            </div>
            <input
              id="creator-background-input"
              ref={bannerInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              data-testid="creator-background-input"
              onChange={onBannerFileChange}
            />
          </div>
          <div className="creator-profile-photo-row">
            {avatarPreview && (
              <span
                className="creator-pending-badge creator-pending-badge-avatar"
                data-testid="creator-avatar-pending"
              >
                New
              </span>
            )}
            <div className="creator-profile-avatar">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt=""
                  width={96}
                  height={96}
                  data-testid={avatarPreview ? "creator-avatar-preview-pending" : "creator-avatar-preview"}
                />
              ) : (
                <span data-testid="creator-avatar-placeholder">{initialsForName(displayName, "C")}</span>
              )}
              <label className="creator-avatar-action" htmlFor="creator-avatar-input">
                <ImageIcon aria-hidden />
                <span className="sr-only">Change avatar</span>
              </label>
              <input
                id="creator-avatar-input"
                name="avatar"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                data-testid="creator-avatar-input"
                onChange={onAvatarFileChange}
              />
            </div>
          </div>
          <div className="creator-profile-field">
            <label
              htmlFor="display-name-input"
            >
              Display name
            </label>
            <Input
              id="display-name-input"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder="Anonymous"
              autoComplete="off"
            />
          </div>
          <div className="creator-profile-field">
            <label htmlFor="creator-bio-input">
              Bio
            </label>
            <textarea
              id="creator-bio-input"
              name="bio"
              value={bio}
              onChange={(e) => onBioChange(e.target.value)}
              placeholder="Tell donors about yourself."
              autoComplete="off"
            />
          </div>
          {status.kind === "saved" && (
            <p className="creator-profile-status text-primary" aria-live="polite" data-testid="creator-save-status">
              Profile saved.
            </p>
          )}
          {status.kind === "error" && (
            <p
              className="creator-profile-status text-destructive"
              aria-live="polite"
              role="alert"
              data-testid="creator-save-status"
            >
              {status.message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function initialsForName(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
